import * as winston from "winston";

export function createEventLogger() {
    const filename = process.env["EVENT_LOG"]
    if (filename) {
        return winston.createLogger({
            transports: [
                new winston.transports.File({
                    filename,
                })
            ]
        })
    } else {
        return createLogger("events")
    }
}

export default function createLogger(filename: string): winston.Logger  {
    return winston.createLogger({
        defaultMeta: {
            filename
        },
        transports: [
            new winston.transports.Console({
                format: winston.format.simple()
            })
        ]
    })
}