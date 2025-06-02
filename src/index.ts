import createLogger from "./logger";
import Camera from "./camera";
import {readFrigateConfig} from "./config"
import Frigate from "./frigate";

const logger = createLogger("index");

(async function() {
    const config = await readFrigateConfig()
    if (!config.cameras) {
        logger.error("No cameras defined!")
        process.exit(1)
    }

    const frigate = new Frigate("http://localhost:5000")
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
        (await Camera.create(cameraName, camera)).listen(frigate)
    }
    logger.info("All cameras configured")
})().then(() => {
    logger.info("Finished")
}).catch(err => {
    logger.error("Failed", err)
})


