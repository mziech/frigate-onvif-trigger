import {createLogger} from "./logger";
import axios, {Axios, AxiosError} from "axios";

const logger = createLogger("frigate")

export enum FrigateLabel {
    person = 'person',
    car = 'car',
    dog = 'dog',
}

interface CreateEventRequest {
    source_type?: string
    sub_label?: string
    score?: number
    duration?: number
    include_recording?: boolean
    draw?: any
}

interface FrigateResponse {
    success?: boolean
    message?: string
}

interface CreateEventResponse extends FrigateResponse {
    event_id?: string
}

interface EndEventRequest {
    end_time?: number
}

/**
 * See https://docs.frigate.video/integrations/api/frigate-http-api
 */
export default class Frigate {
    private client: Axios;

    constructor(baseURL) {
        logger.info(`Using Frigate API at ${baseURL}`)
        this.client = axios.create({
            baseURL,
            responseType: "json",
            timeout: 60000,
            headers: {
                "Accept": "application/json",
                "Content-Type": "application/json",
            },
        })
    }

    public async printVersion() {
        if (process.env["SKIP_FRIGATE_CHECK"] === "TRUE") {
            return
        }
        const resp = await this.client.get<string>("/api/version")
        logger.info(`Frigate version is ${resp.data}`)
    }

    public async getConfigYaml(): Promise<string> {
        const resp = await this.client.get<string>("/api/config/raw")
        return resp.data
    }

    public async createEvent(cameraName: string, label: FrigateLabel, body: CreateEventRequest): Promise<string> {
        let eventId: string = undefined
        try {
            const resp = await this.client.post<CreateEventResponse>(
                `/api/events/${encodeURIComponent(cameraName)}/${encodeURIComponent(label)}/create`, body
            )
            eventId = resp.data.event_id
            logger.info(`Started Frigate event ID ${eventId} for camera ${cameraName} and label ${label}: ${JSON.stringify(resp.data)}`)
        } catch (e) {
            logger.error(`Failed to create Frigate event for camera ${cameraName}: ${JSON.stringify(body)}`, this.formatAxiosError(e))
        }
        return eventId
    }

    public async endEvent(eventId: string, body: EndEventRequest): Promise<void> {
        try {
            const resp = await this.client.put<FrigateResponse>(`/api/events/${encodeURIComponent(eventId)}/end`, body)
            logger.info(`Ended Frigate event ID ${eventId}: ${JSON.stringify(resp.data)}`)
        } catch (e) {
            if (e instanceof AxiosError) {

            } else {
                logger.error(`Could not end Frigate event ID ${eventId}`, this.formatAxiosError(e))
            }
        }
    }

    private formatAxiosError(e) {
        if (e instanceof AxiosError) {
            return {
                status: e.status,
                message: e.message,
                body: e.response.data
            }
        }
        return e
    }

}