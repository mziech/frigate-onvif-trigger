import {CameraConfig} from "./config";
import {Cam} from "onvif/promises";
import {createLogger, createEventLogger} from "./logger";
import {Logger} from "winston";
import Frigate, {FrigateLabel} from "./frigate";

const logger = createLogger("camera");
const eventLogger = createEventLogger()

interface TopicState {
    lastState: boolean
    eventId?: string
}

interface TopicPreset {
    stateKey: string
    label: FrigateLabel
}

const TOPIC_PRESETS : Record<string, TopicPreset> = {
    'RuleEngine/CellMotionDetector/Motion': {stateKey: 'IsMotion', label: FrigateLabel.person},
    'VideoSource/MotionAlarm': {stateKey: 'State', label: FrigateLabel.person},
    'RuleEngine/MyRuleDetector/FaceDetect': {stateKey: 'State', label: FrigateLabel.person},
    'RuleEngine/MyRuleDetector/PeopleDetect': {stateKey: 'State', label: FrigateLabel.person},
    'RuleEngine/MyRuleDetector/VehicleDetect': {stateKey: 'State', label: FrigateLabel.car},
    'RuleEngine/MyRuleDetector/DogCatDetect': {stateKey: 'State', label: FrigateLabel.dog},
}

export default class Camera {
    private name: string
    private cam
    private logger: Logger
    private hasEvents: boolean
    private topicState: Record<string, TopicState>

    constructor(name: string, cam) {
        this.name = name
        this.cam = cam
        this.logger = createLogger("camera/" + name)
        this.topicState = {}
        for (let topic of Object.keys(TOPIC_PRESETS)) {
            this.topicState[topic] = {
                lastState: false
            }
        }
    }

    async init() : Promise<void> {
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
            this.logger.info(`Found events: ${Object.keys(events)}`)
        }
    }

    public listen(frigate: Frigate) {
        this.cam.on('event', (event) => {
            try {
                eventLogger.info("Event", {cameraName: this.name, event})
                const topic = this.getEventTopic(event)
                if (TOPIC_PRESETS[topic]) {
                    const data = this.getEventData(event)
                    let currentState = data[TOPIC_PRESETS[topic].stateKey];
                    if (this.topicState[topic] && this.topicState[topic].lastState !== currentState) {
                        this.logger.info(`Got state change event on ${topic} with data: ${JSON.stringify(data)}`)
                        if (currentState) {
                            frigate.createEvent(this.name, TOPIC_PRESETS[topic].label, {
                                include_recording: true
                            })
                        } else if (this.topicState[topic].eventId) {
                            frigate.endEvent(this.topicState[topic].eventId, {
                                end_time: new Date().toISOString()
                            }).then(() => {
                                this.topicState[topic].eventId = undefined
                            })
                        }
                        this.topicState[topic].lastState = currentState
                    }
                }
            } catch (e) {
                this.logger.error(`Error while processing event: ${JSON.stringify(event)}`, e)
            }
        })
    }

    private getEventTopic(event): string {
        let topic: string = event.topic._
        const colon = topic.indexOf(':')
        if (colon >= 0) {
            return topic.substring(colon + 1)
        }
        return topic
    }

    private  getEventData(event): Record<string, any> {
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
            return { elementItem: event.message.message.data.elementItem }
        } else {
            this.logger.debug("Event data does not contain a simpleItem or elementItem")
            return {}
        }
    }

    public async close() {
        this.logger.info("Closing camera")
        await this.cam.unsubscribe()
    }

    static async create(cameraName: string, cameraConfig: CameraConfig) {
        const cam = new Cam({
            hostname: cameraConfig.onvif.host,
            port: cameraConfig.onvif.port || 8000,
            username: cameraConfig.onvif.user,
            password: cameraConfig.onvif.password,
            path: cameraConfig.onvif.path,
        })
        const camera = new Camera(cameraName, cam)
        await camera.init()
        return camera
    }
}