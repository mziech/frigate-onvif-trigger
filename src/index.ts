import {createLogger} from "./logger";
import Camera from "./camera";
import {readFrigateConfigFromApi, readFrigateConfigFromFile} from "./config"
import Frigate from "./frigate";
import * as wtf from "wtfnode";
import MqttWrapper from "./MqttWrapper";

const logger = createLogger("index");

(async function() {
    const mqtt = new MqttWrapper()
    const frigate = new Frigate(process.env['FRIGATE_URL'] || "http://localhost:5000")
    await frigate.printVersion()

    const config = await readFrigateConfigFromFile() || await readFrigateConfigFromApi(frigate)
    if (!config.cameras) {
        logger.error("No cameras defined!")
        process.exit(1)
    }

    let cameras: Camera[] = []
    for (const [cameraName, camera] of Object.entries(config.cameras)) {
        if (camera.enabled === false) {
            logger.info(`Skipping camera ${cameraName}, not enabled`)
            continue
        }

        if (!camera.onvif || !camera.onvif.host) {
            logger.info(`Skipping camera ${cameraName}, not ONVIF configuration`)
            continue
        }

        logger.info(`Configuring camera ${cameraName}`);
        cameras.push(await Camera.create(cameraName, camera, frigate, mqtt))
    }

    logger.info("All cameras configured")

    const gracefulShutdown = () => {
        logger.info('Shutting down gracefully...');
        setTimeout(() => {
            logger.error('Could not close camera connections in time, forcefully shutting down')
            wtf.dump()
            process.exit(1)
        }, 5000)
        cameras.forEach(cam => cam.close())
        mqtt.close()
    }

    process.on('SIGTERM', gracefulShutdown)
    process.on('SIGINT', gracefulShutdown)

})().then(() => {
    logger.info("Finished")
}).catch(err => {
    logger.error("Failed", err)
})


