import {CameraConfig} from "./config"
import {Cam} from "onvif/promises"
import {createLogger, createEventLogger} from "./logger"
import {Logger} from "winston"
import Frigate, {FrigateLabel} from "./frigate"
import MqttWrapper from "./MqttWrapper"

const logger = createLogger("camera")
const eventLogger = createEventLogger()

interface TopicState {
    lastState: boolean
    eventId?: string
}

enum TopicCategory {
    motion,
    person,
    vehicle,
    animal,
}

interface TopicPreset {
    stateKey: string
    label: FrigateLabel
    category: TopicCategory
    score: number
}

const TOPIC_PRESETS: Record<string, TopicPreset> = {
    'RuleEngine/CellMotionDetector/Motion': {
        stateKey: 'IsMotion',
        category: TopicCategory.motion,
        label: FrigateLabel.eye_glasses,
        score: 0.5
    },
    'VideoSource/MotionAlarm': {
        stateKey: 'State',
        category: TopicCategory.motion,
        label: FrigateLabel.fire_hydrant,
        score: 0.5
    },
    'RuleEngine/MyRuleDetector/FaceDetect': {
        stateKey: 'State',
        category: TopicCategory.person,
        label: FrigateLabel.person,
        score: 1.0
    },
    'RuleEngine/MyRuleDetector/PeopleDetect': {
        stateKey: 'State',
        category: TopicCategory.person,
        label: FrigateLabel.person,
        score: 1.0
    },
    'RuleEngine/MyRuleDetector/VehicleDetect': {
        stateKey: 'State',
        category: TopicCategory.vehicle,
        label: FrigateLabel.car,
        score: 1.0
    },
    'RuleEngine/MyRuleDetector/DogCatDetect': {
        stateKey: 'State',
        category: TopicCategory.animal,
        label: FrigateLabel.dog,
        score: 1.0
    },
}

const DEFAULT_TOPIC_CATEGORY_EXCLUDES: Set<TopicCategory> = new Set<TopicCategory>((process.env["TOPIC_CATEGORY_EXCLUDES"] || "")
    .split(" *, *")
    .filter(s => s in TopicCategory)
    .map(s => TopicCategory[s])
)

export default class Camera {
    private name: string
    private cam
    private logger: Logger
    private hasEvents: boolean
    private topicState: Record<string, TopicState>
    private mqtt: MqttWrapper;

    constructor(name: string, cam, mqtt: MqttWrapper) {
        this.name = name
        this.cam = cam
        this.mqtt = mqtt;
        this.logger = createLogger("camera/" + name)
        this.topicState = {}
        for (let topic of Object.keys(TOPIC_PRESETS)) {
            this.topicState[topic] = {
                lastState: false
            }
        }
    }

    async init(frigate: Frigate): Promise<void> {
        try {
            await this.cam.connect()
            const info = await this.cam.getDeviceInformation()
            this.logger.info("Manufacturer: " + info.manufacturer)
            this.logger.info("Model: " + info.model)
            this.logger.info("Firmware: " + info.firmwareVersion)
            this.logger.info("Serialnumber: " + info.serialNumber)

            const capabilities = await this.cam.getCapabilities()
            this.logger.debug(`Capabilities: ${JSON.stringify(capabilities, null, 2)}`)
            this.hasEvents = capabilities.events?.WSPullPointSupport === true
            this.logger.info(`Camera supports events: ${this.hasEvents}`)
            if (this.hasEvents) {
                const eventProperties = await this.cam.getEventProperties()
                this.logger.debug(`Event properties: ${JSON.stringify(eventProperties, null, 2)}`)
                let events = {}
                const walkEvents = (path: string, nodes) => {
                    for (let [k, v] of Object.entries(nodes)) {
                        if (v["messageDescription"]) {
                            events[path + k] = v
                        } else if (k !== '$' && typeof v === 'object') {
                            walkEvents(path + k + "/", v)
                        }
                    }
                }
                walkEvents("", eventProperties.topicSet)
                this.logger.info(`Found events:\n  ${Object.keys(events).join("\n  ")}`)
            }
            this.listen(frigate)
        } catch (e) {
            this.logger.error("Connection failed retrying in background", e)
            setTimeout(() => this.init(frigate), 10000)
        }
    }

    private listen(frigate: Frigate) {
        this.cam.on('event', (event) => {
            try {
                eventLogger.info("Event", {cameraName: this.name, event})
                const topic = this.getEventTopic(event)
                if (this.shouldLogTopicPreset(TOPIC_PRESETS[topic])) {
                    const data = this.getEventData(event)
                    let currentState = data[TOPIC_PRESETS[topic].stateKey];
                    if (this.topicState[topic] && this.topicState[topic].lastState !== currentState) {
                        this.logger.info(`Got state change event on ${topic} with data: ${JSON.stringify(data)}`)
                        if (currentState) {
                            frigate.createEvent(this.name, TOPIC_PRESETS[topic].label, {
                                start_time: Math.floor(Date.now() / 1000),
                                include_recording: true,
                                score: TOPIC_PRESETS[topic].score,
                            }).then(eventId => {
                                this.topicState[topic].eventId = eventId
                                this.mqtt.publishStart(eventId, this.name, TOPIC_PRESETS[topic].label, TOPIC_PRESETS[topic].score)
                            })
                        } else if (this.topicState[topic].eventId) {
                            frigate.endEvent(this.topicState[topic].eventId, {
                                end_time: Math.ceil(Date.now() / 1000)
                            }).then(() => {
                                this.topicState[topic].eventId = undefined
                            })
                            this.mqtt.publishEnd(this.topicState[topic].eventId, this.name)
                        }
                        this.topicState[topic].lastState = currentState
                    }
                }
            } catch (e) {
                this.logger.error(`Error while processing event: ${JSON.stringify(event)}`, e)
            }
        })
        this.cam.on("connect", () => this.logger.info("Got connect event"))
        this.cam.on("eventsError", error => this.logger.error("Got events error", error))
    }

    private getEventTopic(event): string {
        let topic: string = event.topic._
        const colon = topic.indexOf(':')
        if (colon >= 0) {
            return topic.substring(colon + 1)
        }
        return topic
    }

    private getEventData(event): Record<string, any> {
        if (event.message.message.data && event.message.message.data.simpleItem) {
            if (Array.isArray(event.message.message.data.simpleItem)) {
                let obj = []
                for (let item of event.message.message.data.simpleItem.length) {
                    obj[item.$.Name] = item.$.Value
                }
                return obj
            } else {
                return {
                    [event.message.message.data.simpleItem.$.Name]: event.message.message.data.simpleItem.$.Value
                }
            }
        } else if (event.message.message.data && event.message.message.data.elementItem) {
            this.logger.debug("Event data contains an elementItem")
            return {elementItem: event.message.message.data.elementItem}
        } else {
            this.logger.debug("Event data does not contain a simpleItem or elementItem")
            return {}
        }
    }

    public async close() {
        this.logger.info("Closing camera")
        this.cam.removeAllListeners()
        this.cam.unsubscribe()
    }

    private shouldLogTopicPreset(topic: TopicPreset | undefined): boolean {
        if (topic === undefined) {
            return false
        }

        if (DEFAULT_TOPIC_CATEGORY_EXCLUDES.has(topic.category)) {
            return false
        }

        return true
    }

    static async create(cameraName: string, cameraConfig: CameraConfig, frigate: Frigate, mqtt: MqttWrapper) {
        const cam = new Cam({
            hostname: cameraConfig.onvif.host,
            port: cameraConfig.onvif.port || 8000,
            username: cameraConfig.onvif.user,
            password: cameraConfig.onvif.password,
            path: cameraConfig.onvif.path,
        })
        const camera = new Camera(cameraName, cam, mqtt)
        await camera.init(frigate)
        return camera
    }
}