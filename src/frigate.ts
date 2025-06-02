import {Axios} from "axios";

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

interface EndEventRequest {
    end_time?: string
}

export default class Frigate {
    private client: Axios;

    constructor(url) {
        this.client = new Axios({url})
    }

    public async createEvent(cameraName: string, label: FrigateLabel, body: CreateEventRequest): Promise<string> {
        const resp = await this.client.post(`/api/events/${encodeURIComponent(cameraName)}/${encodeURIComponent(label)}/create`, body)
        return resp.data.event_id
    }

    public async endEvent(eventId: string, body: EndEventRequest): Promise<void> {
        await this.client.put(`/api/events/${encodeURIComponent(eventId)}/end`, body)
    }

}