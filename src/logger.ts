import * as winston from "winston";
import "winston-daily-rotate-file";

const SKIP_OTHER = new Set(['message', 'level', 'timestamp', 'filename'])

function maybeOtherFields(info: object): string {
    let s = ''
    for (const [k, v] of Object.entries(info)) {
        if (!SKIP_OTHER.has(k)) {
            try {
                s = `${s} ${k}: ${JSON.stringify(v, null, 2)}`
            } catch (e) {
                s = `${s} ${k}: ${v}`
            }
        }
    }
    return s
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
