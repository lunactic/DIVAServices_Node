"use strict";
import { DivaError } from './models/divaError';
if (!(process.env.NODE_ENV != null) || ["dev", "test", "prod"].indexOf(process.env.NODE_ENV) < 0) {
    console.log("please set NODE_ENV to [dev, test, prod]. going to exit");
    process.exit(0);
}

import * as _ from "lodash";
import * as nconf from "nconf";
import * as bodyParser from "body-parser";
import * as express from "express";
import * as path from "path";
import * as fs from "fs";
import * as morgan from "morgan";
import * as mime from "mime";
import { Logger } from "./logging/logger";
import { Statistics } from "./statistics/statistics";
import { FileHelper } from "./helper/fileHelper";
import { QueueHandler } from "./processingQueue/queueHandler";
let router = require("./routes/standardRouter");
let algorithmRouter = require("./routes/algorithmRouter");
let ipFilter = require("express-ipfilter").IpFilter;
let IpDeniedError = require("express-ipfilter").IpDeniedError;
/**
 * The server.
 *
 * @class Server
 */
class Server {

    public app: express.Application;

    /**
     * Bootstrap the application.
     *
     * @class Server
     * @method bootstrap
     * @static
     * @return {ng.auto.IInjectorService} Returns the newly created injector for this app.
     */
    public static bootstrap(): Server {
        return new Server();
    }


    /**
     * Constructor.
     *
     * @class Server
     * @constructor
     */
    constructor() {
        //create express js application
        this.app = express();

        //configure application
        this.config();

        //configure routes
        this.routes();


    }

    /**
     * Configure application
     *
     * @class Server
     * @method config
     * @return void
     */
    private config() {
        mime.load(__dirname + path.sep + "../conf/divaservices.types");
        Statistics.loadStatistics();
        QueueHandler.initialize();

        //mount query string parser
        this.app.use(bodyParser.urlencoded({ extended: true, limit: "2500mb" }));
        //mount json form parser
        this.app.use(bodyParser.json({ limit: "2500mb" }));


        let accessLogStream = fs.createWriteStream(__dirname + path.sep + "../logs" + path.sep + "access.log", { flags: "a" });
        this.app.use(morgan("combined", { stream: accessLogStream }));

        //set up helper for text/plain
        this.app.use(function (req: express.Request, res: express.Response, next: express.NextFunction) {
            if (req.is("text/*")) {
                req["text"] = "";
                req.setEncoding("utf8");
                req.on("data", function (chunk: any) {
                    req["text"] += chunk;
                });
                req.on("end", next);
            } else {
                next();
            }
        });

        // catch 404 and forward to error handler
        this.app.use(function (err: any, req: express.Request, res: express.Response, next: express.NextFunction) {
            if (err.status === 400 && err.name === "SyntaxError" && err.body != null) {
                let error = {
                    status: 500,
                    message: "Json Body parser error: " + err.body.slice(0, 100).toString(),
                    type: "SyntaxError"
                };
                res.status(error.status);
                res.json(error);
            } else {
                err.status = 404;
                next(err);
            }
        });

        this.app.use(function (err: any, req: express.Request, res: express.Response, next: express.NextFunction) {
            if (err instanceof IpDeniedError) {
                Logger.log("error", "Unauthorized access from: " + req.ip, "DivaServer");
                res.status(401);
                let error = new DivaError("You are not authorized to access this part of DIVAServices", 401, "AccessError");
                res.json(error);
            }
        });
    }

    private routes() {
        //set up static file handlers!
        this.app.use("/files", express.static(nconf.get("paths:filesPath")));
        this.app.use("/results", express.static(nconf.get("paths:resultsPath")));
        this.app.use("/test", express.static(nconf.get("paths:executablePath")));
        this.app.use("/logs", express.static(nconf.get("paths:logPath")));
        //use router middleware

        this.app.use(router);
        // Set up the white listed ips for the Algorithm Router
        let whiteIps = nconf.get("server:managementWhitelistIp");
        this.app.use(ipFilter(whiteIps, { mode: 'allow', logLevel: 'deny' }));
        this.app.use(algorithmRouter);

    }
}


//shutdown handler
process.on("SIGTERM", function () {
    Logger.log("info", "RECEIVED SIGTERM", "Server");
    FileHelper.saveFileInfo();
    process.exit(0);
});

process.on('unhandledRejection', (reason, p) => {
    console.log('Unhandled Rejection at: Promise', p, 'reason:', reason);
    // application specific logging, throwing an error, or other logic here
});

export = Server.bootstrap().app;
