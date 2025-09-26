import mqtt from "mqtt"
import {createLogger} from "./logger";

const logger = createLogger("mqtt")

export default class MqttWrapper {
    private readonly client: mqtt.MqttClient | null;
    private readonly topic: string;

    constructor() {
        this.topic = process.env["MQTT_TOPIC"] || "frigate-onvif-trigger/events"
        if (!process.env["MQTT_URI"]) {
            logger.info("Not sending MQTT events")
            this.client = null;
            return
        }

        let options: mqtt.IClientOptions = {};
        if (process.env["MQTT_USERNAME"]) {
            options.username = process.env["MQTT_USERNAME"]
        }
        if (process.env["MQTT_PASSWORD"]) {
            options.password = process.env["MQTT_PASSWORD"]
        }
        this.client = mqtt.connect(process.env["MQTT_URI"], options)
        logger.info(`Sending MQTT events to ${process.env["MQTT_URI"]}, topic ${this.topic}`)
    }

    public publishStart(id: string, camera: string, label: string, score: number) {
        this.publishEvent({
            "type": "new",
            "after": {
                id, camera, label, score
            }
        })
    }

    public publishEnd(id: string, camera: string) {
        this.publishEvent({
            "type": "end",
            "after": {
                id, camera
            }
        })
    }

    public publishEvent(event) {
        if (!this.client) {
            return
        }

        this.client.publishAsync(this.topic, JSON.stringify(event))
            .then(() => logger.info("MQTT event published"))
            .catch(err => logger.error("Failed to publish MQTT event", event, err))
    }

    public close() {
        if (this.client) {
            this.client.end()
        }
    }
}
