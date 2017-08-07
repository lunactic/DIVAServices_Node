/**
 * Created by Marcel Würsch on 04.11.16.
 */
import * as _ from "lodash";
import * as express from "express";
import { IoHelper } from "../helper/ioHelper";
import { Logger } from "../logging/logger";
import * as nconf from "nconf";
import * as path from "path";
import * as mime from "mime";
import { ServicesInfoHelper } from "../helper/servicesInfoHelper";
import { DockerManagement } from "../docker/dockerManagement";
import { ExecutableHelper } from "../helper/executableHelper";
import { QueueHandler } from "../processingQueue/queueHandler";
import { Swagger } from "../swagger/swagger";
import { DivaError } from "../models/divaError";

let crypto = require("crypto");

/**
 * class for automated algorithm management
 * 
 * The functionality of this class is closely related to DIVAServices-Management (see: https://github.com/lunactic/DIVAServices-Management)
 * 
 * @export
 * @class AlgorithmManagement
 */
export class AlgorithmManagement {

    /**
     * Create a new algorithm on DIVAServices
     * 
     * This method performs the following steps:
     *  - update the services file
     *  - create the docker image
     *  - run the image once with default values
     * 
     * @static
     * @param {express.Request} req the incoming POST request
     * @param {express.Response} res the HTTP response object
     * @param {string} route the called route
     * @param {string} identifier the identifier to use
     * @param {string} imageName the name of the image
     * @param {number} version the version number
     * @param {string} baseroute the base route information
     * 
     * @memberOf AlgorithmManagement
     */
    static async createAlgorithm(req: express.Request, res: express.Response, route: string, identifier: string, imageName: string, version: number, baseroute: string): Promise<any> {
        return new Promise<any>(async (resolve, reject) => {
            try {
                AlgorithmManagement.updateServicesFile(req.body, identifier, route, imageName, version, baseroute);
                await IoHelper.downloadFileWithTypecheck(req.body.method.file, nconf.get("paths:executablePath") + path.sep + route, "application/zip");
                //create docker file
                DockerManagement.createDockerFile(req.body, nconf.get("paths:executablePath") + path.sep + route);
                //create bash script
                DockerManagement.createBashScript(identifier, req.body, nconf.get("paths:executablePath") + path.sep + route);
                //update services file
                AlgorithmManagement.updateStatus(identifier, "creating", "/" + route, null);
                let response = {
                    statusCode: 200,
                    identifier: identifier,
                    statusText: "Started Algorithm Creation"
                };
                resolve(response);
                try {
                    await DockerManagement.buildImage(nconf.get("paths:executablePath") + path.sep + route, imageName);
                    AlgorithmManagement.updateStatus(identifier, "testing", null, null);
                    //unzip the file
                    await IoHelper.unzipFile(nconf.get("paths:executablePath") + path.sep + route + path.sep + "algorithm.zip", nconf.get("paths:executablePath") + path.sep + route);
                    let executableHelper = new ExecutableHelper();
                    let inputs = {};
                    let highlighter = {};
                    let data = {};
                    for (let input of req.body.input) {
                        if (!(nconf.get("reservedWords").indexOf(_.keys(input)[0]) >= 0) || _.keys(input)[0] === "highlighter" || _.keys(input)[0] === 'file' || _.keys(input)[0] === 'folder') {
                            switch (_.keys(input)[0]) {
                                case "select":
                                    inputs[input.select.name] = input.select.options.values[input.select.options.default];
                                    break;
                                case "number":
                                    inputs[input.number.name] = input.number.options.default;
                                    break;
                                case "text":
                                    inputs[input.text.name] = input.text.options.default;
                                    break;
                                case "json":
                                    inputs[input.json.name] = IoHelper.openFile(nconf.get("paths:testPath") + path.sep + "json" + path.sep + "array.json");
                                    break;
                                case "file":
                                    data[input.file.name] = nconf.get("paths:executablePath") + path.sep + route + path.sep + input.file.name + "." + mime.extension(input.file.options.mimeType);
                                    break;
                                case "folder":
                                    data[input.folder.name] = nconf.get("paths:executablePath") + path.sep + route + path.sep + input.folder.name + ".zip";
                                    break;
                                case "highlighter":
                                    switch (input.highlighter.type) {
                                        case "polygon":
                                            highlighter = {
                                                type: "polygon",
                                                closed: true,
                                                segments: [[1, 1], [1, 150], [350, 150], [350, 1]]
                                            };
                                            break;
                                        case "rectangle":
                                        case "polygon":
                                            highlighter = {
                                                type: "rectangle",
                                                closed: true,
                                                segments: [[1, 1], [1, 150], [350, 150], [350, 1]]
                                            };
                                            break;
                                    }
                                    break;
                            }
                        }
                    }
                    inputs["highlighter"] = highlighter;
                    let testRequest = {
                        originalUrl: "/" + route,
                        body: {
                            data: [data],
                            parameters: inputs
                        }
                    };
                    await AlgorithmManagement.createInfoFile(req.body, nconf.get("paths:jsonPath") + path.sep + route);
                    await executableHelper.preprocess(testRequest, QueueHandler.dockerProcessingQueue, "test");
                    let job = QueueHandler.dockerProcessingQueue.getNext();
                    QueueHandler.runningDockerJobs.push(job);
                    await ExecutableHelper.executeDockerRequest(job);
                    await AlgorithmManagement.updateRootInfoFile(req.body, route);
                    let info = IoHelper.openFile(nconf.get("paths:jsonPath") + path.sep + route + path.sep + "info.json");
                    Swagger.createEntry(info, route);

                } catch (error) {
                    AlgorithmManagement.updateStatus(identifier, "error", route, error.message);
                    return reject(new DivaError(error.message, 500, "AlgorithmCreationError"));
                }
            } catch (error) {
                AlgorithmManagement.updateStatus(identifier, "error", route, "algorithm file has the wrong format");
                return reject(new DivaError("fileUrl does not point to a correct zip file", 500, "FileFormatError"));
            }
        });
    }

    /**
     * get the status of an algorithm based on its identifier
     * 
     * @static
     * @param {string} identifier the identifier
     * @returns {*} the current status
     * 
     * @memberOf AlgorithmManagement
     */
    static getStatusByIdentifier(identifier: string): any {
        let content = IoHelper.openFile(nconf.get("paths:servicesInfoFile"));
        let info: any = _.find(content.services, { "identifier": identifier });
        if (info != null) {
            let message = {
                status: info.status,
                statistics: info.statistics
            };
            return message;
        } else {
            return null;
        }
    }

    /**
     * get the status of an algorithm based off the route
     * 
     * @static
     * @param {string} route the route of the algorithm
     * @returns {*} the current status
     * 
     * @memberOf AlgorithmManagement
     */
    static getStatusByRoute(route: string): any {
        let content = IoHelper.openFile(nconf.get("paths:servicesInfoFile"));
        let status = _.find(content.services, { "baseRoute": route });
        if (status != null) {
            return status;
        } else {
            return null;
        }
    }

    static getVersionByBaseRoute(route: string): number {
        let content = IoHelper.openFile(nconf.get("paths:servicesInfoFile"));
        let algorithm: any = _.find(content.services, { "baseroute": route });
        if (algorithm != null) {
            return algorithm.version;
        } else {
            return 1;
        }
    }

    /**
     * create a new algorithm identifier
     * 
     * @static
     * @returns {string} the new identifier
     * 
     * @memberOf AlgorithmManagement
     */
    static createIdentifier(): string {
        let currentDate = (new Date()).valueOf().toString();
        let random = Math.random().toString();
        return crypto.createHash("sha1").update(currentDate + random).digest("hex");
    }

    /**
     * create a new route for an algorithm
     * 
     * @static
     * @param {*} algorithm the name of the algorithm
     * @returns {string} the dynamic route for this algorithm
     * 
     * @memberOf AlgorithmManagement
     */
    static generateBaseRoute(algorithm: any): string {
        return algorithm.general.type.toLowerCase() + "/" + algorithm.general.name.replace(/\s/g, "").toLowerCase();
    }

    /**
     * generate all necessary folders for a method
     * 
     * @static
     * @param {string} route the route of the new method
     * 
     * @memberOf AlgorithmManagement
     */
    static async generateFolders(route: string): Promise<void> {
        return new Promise<void>(async (resolve, reject) => {
            await IoHelper.createFolder(nconf.get("paths:executablePath") + path.sep + route);
            await IoHelper.createFolder(nconf.get("paths:logPath") + path.sep + route);
            await IoHelper.createFolder(nconf.get("paths:jsonPath") + path.sep + route);
            resolve();
        });
    }

    /**
     * generate the name of the image
     * 
     * @static
     * @param {*} algorithm the new algorithm
     * @param {number} version the version of the algorithm
     * @returns {string} the name for the image
     * 
     * @memberOf AlgorithmManagement
     */
    static generateImageName(algorithm: any, version: number): string {
        return algorithm.general.type.toLowerCase() + algorithm.general.name.toLowerCase().replace(/\s/g, "_") + ":" + String(version);
    }

    /**
     * create the algorithm information file
     * 
     * @static
     * @param {*} algorithm the algorithm information
     * @param {string} folder the algorithm folder
     * 
     * @memberOf AlgorithmManagement
     */
    static async createInfoFile(algorithm: any, folder: string) {
        let data = _.cloneDeep(algorithm);
        let reservedWords = _.clone(nconf.get("reservedWords"));
        _.remove(reservedWords, function (word: any) {
            return (word === "highlighter");
        });
        //_.unset(data, "output");
        _.unset(data, "method");

        _.forEach(data.input, function (input: any) {
            if (_.includes(reservedWords, _.keys(input)[0]) && _.keys(input)[0] !== 'file') {
                input[_.keys(input)[0]]["userdefined"] = false;
            } else {
                input[_.keys(input)[0]]["userdefined"] = true;
            }
        });

        try {
            await IoHelper.saveFile(folder + path.sep + "info.json", data, "utf8");
            Logger.log("info", "saved file", "AlgorithmManagement");
        } catch (error) {
            Logger.log("error", error, "AlgorithmManagement");
        }
    }

    /**
     * delete the algorithm information file
     * 
     * @static
     * @param {string} folder the folder of the file
     * 
     * @memberOf AlgorithmManagement
     */
    static deleteInfoFile(folder: string): void {
        IoHelper.deleteFile(folder + path.sep + "info.json");
    }

    /**
     * add the new algorithm to the root information file
     * 
     * @static
     * @param {*} algorithm the new algorithm information
     * @param {string} route the route of the new algorithm
     * 
     * @memberOf AlgorithmManagement
     */
    static async updateRootInfoFile(algorithm: any, route: string) {
        let fileContent = IoHelper.openFile(nconf.get("paths:rootInfoFile"));
        let newEntry = {
            name: algorithm.general.name,
            description: algorithm.general.description,
            type: algorithm.general.type,
            url: "http://$BASEURL$/" + route
        };
        fileContent.push(newEntry);
        await IoHelper.saveFile(nconf.get("paths:rootInfoFile"), fileContent, "utf8");

    }

    /**
     * remove algorithm information for the root info file
     * 
     * @static
     * @param {string} route the route to remove
     * 
     * @memberOf AlgorithmManagement
     */
    static async removeFromRootInfoFile(route: string) {
        let fileContent = IoHelper.openFile(nconf.get("paths:rootInfoFile"));
        _.remove(fileContent, function (entry: any) {
            return entry.url === "http://$BASEURL$" + route;
        });
        await IoHelper.saveFile(nconf.get("paths:rootInfoFile"), fileContent, "utf8");
    }

    /**
     * remove algorithm information from the service information file
     * 
     * @static
     * @param {string} route the route to remove
     * 
     * @memberOf AlgorithmManagement
     */
    static async removeFromServiceInfoFile(route: string) {
        let fileContent = IoHelper.openFile(nconf.get("paths:servicesInfoFile"));
        _.remove(fileContent.services, { "baseRoute": route });
        await IoHelper.saveFile(nconf.get("paths:servicesInfoFile"), fileContent, "utf8");
        ServicesInfoHelper.reload();
    }

    /**
     * update the status of an algorithm
     * 
     * @static
     * @param {string} identifier the algorithm information
     * @param {string} status the new status information
     * @param {string} route the route
     * @param {string} message the new message
     * 
     * @memberOf AlgorithmManagement
     */
    static async updateStatus(identifier: string, status: string, route: string, message: string) {
        let content = IoHelper.openFile(nconf.get("paths:servicesInfoFile"));
        let currentInfo: any = {};
        if (identifier != null && _.find(content.services, { "identifier": identifier }) != null) {
            currentInfo = _.find(content.services, { "identifier": identifier });
        } else if (route != null && _.find(content.services, { "path": route }) != null) {
            currentInfo = _.find(content.services, { "path": route });
        }

        switch (status) {
            case "creating":
                currentInfo.status.statusCode = 100;
                currentInfo.status.statusMessage = "Building Algorithm DivaImage";
                break;
            case "testing":
                currentInfo.status.statusCode = 110;
                currentInfo.status.statusMessage = "Testing Algorithm";
                break;
            case "ok":
                currentInfo.status.statusCode = 200;
                currentInfo.status.statusMessage = "Algorithm is Available";
                break;
            case "error":
                currentInfo.status.statusCode = 500;
                currentInfo.status.statusMessage = "Error: " + message;
                break;
            case "delete":
                currentInfo.status.statusCode = 410;
                currentInfo.status.statusMessage = "This algorithm is no longer available";
                break;
        }
        await IoHelper.saveFile(nconf.get("paths:servicesInfoFile"), content, "utf8");
    }

    /**
     * update the route for an existing algorithm when the algorithm is updated
     * 
     * @static
     * @param {string} identifier the identifier to update
     * @param {string} route the new route 
     * 
     * @memberOf AlgorithmManagement
     */
    static async updateRoute(identifier: string, route: string) {
        let content = IoHelper.openFile(nconf.get("paths:servicesInfoFile"));
        if (identifier != null && _.find(content.services, { "identifier": identifier }) != null) {
            let currentInfo: any = _.find(content.services, { "identifier": identifier });
            currentInfo.path = route;
            await IoHelper.saveFile(nconf.get("paths:servicesInfoFile"), content, "utf8");
        }
    }

    /**
     * add a url parameter to a method
     * 
     * this is used when a method requires additional input files that need to be downloaded
     * 
     * @static
     * @param {string} identifier the algorithm identifier
     * @param {string} parameterName the name of the parameter
     * 
     * @memberOf AlgorithmManagement
     */
    static async addUrlParameter(identifier: string, parameterName: string) {
        let content = IoHelper.openFile(nconf.get("paths:servicesInfoFile"));
        if (identifier != null && _.find(content.services, { "identifier": identifier }) != null) {
            let currentInfo: any = _.find(content.services, { "identifier": identifier });
            let info: any = {};
            let exists: boolean = false;

            _.forEach(currentInfo.parameters, function (value: any, key: any) {
                if (_.has(value, parameterName)) {
                    exists = true;
                }
            });

            if (!exists) {
                info[parameterName] = "url";
                currentInfo.parameters.unshift(info);
            }
            await IoHelper.saveFile(nconf.get("paths:servicesInfoFile"), content, "utf8");
        }
    }

    /**
     * 
     * add a remote path to a method
     * 
     * this is used for the replacement of fix remote paths
     * 
     * @static
     * @param {string} identifier the algorithm identifier
     * @param {string} parameterName the name of the parameter
     * @param {string} remotePath the remote path value
     * 
     * @memberOf AlgorithmManagement
     */
    static async addRemotePath(identifier: string, parameterName: string, remotePath: string) {
        let content = IoHelper.openFile(nconf.get("paths:servicesInfoFile"));
        if (identifier != null && _.find(content.services, { "identifier": identifier }) != null) {
            let currentInfo: any = _.find(content.services, { "identifier": identifier });
            let info: any = {};
            let exists: boolean = false;
            _.forEach(currentInfo.remotePaths, function (value: any, key: any) {
                if (_.has(value, parameterName)) {
                    exists = true;
                }
            });

            if (!exists) {
                info[parameterName] = remotePath;
                currentInfo.remotePaths.push(info);
            }
            await IoHelper.saveFile(nconf.get("paths:servicesInfoFile"), content, "utf8");
        }
    }

    static hasRemotePath(identifier: string, parameterName: string): boolean {
        let content = IoHelper.openFile(nconf.get("paths:servicesInfoFile"));
        if (identifier != null && _.find(content.services, { "identifier": identifier }) != null) {
            let currentInfo: any = _.find(content.services, { "identifier": identifier });
            let remotePath = _.find(currentInfo.remotePaths, function (path: any) {
                return _.keys(path)[0] === parameterName;
            });
            return remotePath != null;
        }
        return false;
    }

    static getRemotePath(identifier: string, parameterName: string): string {
        let content = IoHelper.openFile(nconf.get("paths:servicesInfoFile"));
        if (identifier != null && _.find(content.services, { "identifier": identifier }) != null) {
            let currentInfo: any = _.find(content.services, { "identifier": identifier });
            let remotePath = _.find(currentInfo.remotePaths, function (path: any) {
                return _.keys(path)[0] === parameterName;
            });
            return String(_.values(remotePath)[0]);
        }
        return "";
    }

    /**
     * record an execution exception for an algorithm
     * 
     * @static
     * @param {string} identifier the algorithm identifier
     * @param {*} exception the execution that occured
     * 
     * @memberOf AlgorithmManagement
     */
    static async recordException(identifier: string, exception: any) {
        let content = IoHelper.openFile(nconf.get("paths:servicesInfoFile"));
        if (identifier != null && _.find(content.services, { "identifier": identifier }) != null) {
            let currentInfo: any = _.find(content.services, { "identifier": identifier });
            let message = {
                date: new Date().toJSON(),
                errorMessage: exception
            };
            currentInfo.exceptions.push(message);
            await IoHelper.saveFile(nconf.get("paths:servicesInfoFile"), content, "utf8");
        }
    }

    /**
     * get all exceptions of an algorithm
     * 
     * @static
     * @param {string} identifier the algorithm identifier
     * @returns {*} all occured exceptions
     * 
     * @memberOf AlgorithmManagement
     */
    static getExceptions(identifier: string): any {
        let content = IoHelper.openFile(nconf.get("paths:servicesInfoFile"));
        if (identifier != null && _.find(content.services, { "identifier": identifier }) != null) {
            let currentInfo: any = _.find(content.services, { "identifier": identifier });
            return currentInfo.exceptions;
        }
        return null;
    }

    /**
     * update the serivce info file
     * 
     * @static
     * @param {*} algorithm the new algorithm information
     * @param {string} identifier the algorithm identifier
     * @param {string} route the algorithm route
     * @param {string} imageName the name of the docker image
     * @param {number} version the version number of the algorithm
     * @param {string} baseRoute the base route without the version number
     * 
     * @memberOf AlgorithmManagement
     */
    static updateServicesFile(algorithm: any, identifier: string, route: string, imageName: string, version: number, baseRoute: string): void {
        ServicesInfoHelper.reload();
        if (this.getStatusByIdentifier(identifier) != null || this.getStatusByRoute(baseRoute) != null) {
            this.removeFromServiceInfoFile(baseRoute);
        }
        if ((this.getStatusByIdentifier(identifier) == null) && (this.getStatusByRoute(baseRoute) == null)) {
            let newContent = _.cloneDeep(ServicesInfoHelper.fileContent);
            let parameters: any = [];
            let data: any = [];
            let paramOrder: any = [];
            let fileCount: number = 0;
            _.forEach(algorithm.input, function (input: any, key: any) {
                let inputType = _.keys(input)[0];
                key = _.get(algorithm, "input[" + key + "]." + inputType + ".name", inputType);
                let info: any = {};
                if (inputType === 'file' || inputType === 'folder') {
                    fileCount++;
                    info[key] = inputType;
                    data.push(info);
                    paramOrder.push(info);
                } else {
                    info[key] = inputType;
                    parameters.push(info);
                    paramOrder.push(info);
                }
            });
            let newServiceEntry = {
                service: route.replace(/\//g, "").toLowerCase(),
                baseRoute: "/" + baseRoute,
                identifier: identifier,
                path: "/" + route,
                executablePath: nconf.get("paths:executablePath") + path.sep + route + path.sep + algorithm.method.executable_path,
                allowParallel: true,
                hasMultipleFiles: (fileCount > 1),
                hasData: (fileCount > 0),
                output: "file",
                execute: "docker",
                executableType: algorithm.method.executableType,
                image_name: imageName,
                parameters: parameters,
                data: data,
                paramOrder: paramOrder,
                remotePaths: [],
                version: version,
                status: {
                    statusCode: -1,
                    statusMessage: ""
                },
                statistics: {
                    runtime: -1,
                    executions: 0
                },
                exceptions: []
            };

            newContent.services.push(newServiceEntry);
            ServicesInfoHelper.update(newContent);
            ServicesInfoHelper.reload();
        }
    }

    /**
     * update the identifier of an algorithm
     * 
     * @static
     * @param {string} route the route of the algorithm
     * @param {string} identifier the new algorithm identifier
     * 
     * @memberOf AlgorithmManagement
     */
    static updateIdentifier(route: string, identifier: string): void {
        let content = IoHelper.openFile(nconf.get("paths:servicesInfoFile"));
        let service: any = _.find(content.services, { "path": route });
        service.identifier = identifier;
        ServicesInfoHelper.update(content);
        ServicesInfoHelper.reload();
    }

    /**
     * test if results are valid
     * 
     * @static
     * @param {*} results the computed results from the test run
     * @param {any[]} outputs the output definitions
     * @returns {Promise<void>} 
     * @memberof AlgorithmManagement
     */
    static testResults(results: any, outputs: any[]): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            outputs.forEach(element => {
                switch (Object.keys(element)[0]) {
                    case "number":
                        let result = _.find(results, function (o: any) {
                            return Object.keys(o)[0] === "number" && o.number.name === element.number.name;
                        });
                        if (result == null) {
                            reject("did not find a result for output parameter: " + element.number.name);
                        } else {
                            let resultValue = result.number.value;
                            let min: number = element.number.options.min;
                            let max: number = element.number.options.max;
                            let name: string = element.number.name;
                            if (result < min || result > max) {
                                reject("error processing " + result.number.name + ": computed value is " + resultValue + " but the range is " + min + " - " + max);
                            }
                        }
                        break;
                    case "file":
                        break;
                    default:
                        break;
                }
            });
            resolve();
        });
    }
}