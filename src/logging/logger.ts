/**
 * Created by Marcel Würsch on 02.11.16.
 */

"use strict";

import * as log4js from "log4js";
import * as nconf from "nconf";

//log4js.configure({appenders: nconf.get("logger:appenders")}, {categories: nconf.get("logger:categories")});
log4js.configure({
  appenders: nconf.get("logger:appenders"),
  categories: nconf.get("logger:categories")
});

let logger = log4js.getLogger("DIVAServices");

/**
 * Logger class making use of log4js
 * 
 * @export
 * @class Logger
 */
export class Logger {

    /**
     * log method
     * 
     * @static
     * @param {string} level the log level
     * @param {string} msg the information to log
     * @param {string} [module] the module
     * 
     * @memberOf Logger
     */
    static log(level: string, msg: string, module?: string) {
        level = level || "info";

        if (module != null) {
            logger[level](msg + (" [" + module + "]"));
        } else {
            logger[level](msg);
        }
    }
}

