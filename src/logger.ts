import * as winston from "winston";
import "winston-daily-rotate-file";

function maybeOtherFields(info): string {
    let other = { ...info }
    delete other.message
    delete other.level
    delete other.timestamp
    delete other.filename
    if (Object.entries(other).length === 0) {
        return ""
    }
    return ` ${JSON.stringify(other, null, 2)}`
}

function createFormat() {
    return winston.format.combine(
        winston.format.timestamp(),
        winston.format.printf(info => `${info.timestamp} [${info.level}] ${info.filename}: ${info.message}${maybeOtherFields(info)}`),
    );
}

export function createLogger(filename: string): winston.Logger  {
    return winston.createLogger({
        defaultMeta: {
            filename
        },
        format: createFormat(),
        transports: [
            new winston.transports.Console({
            })
        ],
    })
}

export function createEventLogger() {
    const filename = process.env["EVENT_LOG"]
    if (filename) {
        return winston.createLogger({
            format: createFormat(),
            transports: [
                new winston.transports.DailyRotateFile({
                    level: 'info',
                    filename: filename + '-%DATE%.log',
                    datePattern: 'YYYY-MM-DD-HH',
                    zippedArchive: true,
                    maxSize: '100m',
                    maxFiles: '14d'
                })
            ]
        })
    } else {
        return createLogger("events")
    }
}
