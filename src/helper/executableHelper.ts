"use strict";
/**
 * Created by Marcel Würsch on 07.11.16.
 */
import { isNullOrUndefined } from 'util';
import * as _ from "lodash";
import * as childProcess from "child_process";
import { EventEmitter } from "events";
import * as nconf from "nconf";
import { Logger } from "../logging/logger";
import { Collection } from "../processingQueue/collection";
import { ConsoleResultHandler } from "./resultHandlers/consoleResultHandler";
import { DockerManagement } from "../docker/dockerManagement";
import { FileResultHandler } from "./resultHandlers/fileResultHandler";
import { DivaFile } from "../models/divaFile";
import { IoHelper } from "./ioHelper";
import { NoResultHandler } from "./resultHandlers/noResultHandler";
import * as path from "path";
import { Process } from "../processingQueue/process";
import { ParameterHelper } from "./parameterHelper";
import { RemoteExecution } from "../remoteExecution/remoteExecution";
import { ResultHelper } from "./resultHelper";
import { ServicesInfoHelper } from "./servicesInfoHelper";
import { Statistics } from "../statistics/statistics";
import { ProcessingQueue } from "../processingQueue/processingQueue";
import { RandomWordGenerator } from "../randomizer/randomWordGenerator";

/**
 * A class the provides all functionality needed before a process can be executed
 * 
 * @export
 * @class ExecutableHelper
 * @extends {EventEmitter}
 */
export class ExecutableHelper extends EventEmitter {

    remoteExecution: RemoteExecution;

    /**
     * Creates an instance of ExecutableHelper.
     * 
     * 
     * @memberOf ExecutableHelper
     */
    constructor() {
        super();
        this.remoteExecution = new RemoteExecution(nconf.get("remoteServer:ip"), nconf.get("remoteServer:user"));
    }

    /**
     * Builds the command line executable command
     * @param {Process} process the process to execute
     */
    private buildCommand(process: Process): string {
        let execType = this.getExecutionType(process.executableType);

        let paramsPath = "";

        for (let param of _.values(process.parameters.params)) {
            paramsPath += "'" + param + "'";
        }
        return execType + " " + process.executablePath + " " + paramsPath;
    }

    /**
     * Build the remote command for execution on a Sun Grid Engine using qsub
     * @param {Process} process The process to execute
     */
    private buildRemoteCommand(process: Process): string {
        let params = _.cloneDeep(process.parameters.params);
        _.forIn(params, function (value: any, key: any) {
            switch (key) {
                case "inputImage":
                case "outputImage":
                case "resultFile":
                    let extension = path.extname(value);
                    let filename = path.basename(value, extension);
                    params[key] = process.rootFolder + path.sep + filename + extension;
                    break;
                case "outputFolder":
                    params[key] = process.rootFolder + path.sep;
                    break;
            }
        });

        _.forOwn(_.intersection(_.keys(params), _.keys(nconf.get("remotePaths"))), function (value: any, key: any) {
            params[value] = nconf.get("remotePaths:" + value);
        });

        let paramsPath = _.values(params).join(" ");
        return "qsub -o " + process.rootFolder + " -e " + process.rootFolder + " " + process.executablePath + " " + paramsPath;
    }

    /**
     * executes a command using the [childProcess](https://nodejs.org/api/child_process.html) module
     * @param {string} command the command to execute
     * @param {Process} process the process
     */
    private executeCommand(command: string, process: Process): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            let exec = childProcess.exec;
            Logger.log("info", "Execute command: " + command, "ExecutableHelper");
            exec(command, { maxBuffer: 1024 * 48828 }, async function (error: any, stdout: any, stderr: any) {
                Statistics.endRecording(process.id, process.req.originalUrl, [0, 0]);
                try {
                    await process.resultHandler.handleResult(error, stdout, stderr, process);
                    resolve();
                } catch (error) {
                    return reject(error);
                }
            });
        });
    }

    /**
     * Executes a process on the same host as this DivaServices instance is running
     * @param {Process} process The process to execute
     */
    public async executeLocalRequest(process: Process) {
        let self = this;
        process.id = Statistics.startRecording(process);
        let command = self.buildCommand(process);
        if (process.resultType === "console") {
            command += " 1>" + process.tmpResultFile + ";mv " + process.tmpResultFile + " " + process.resultFile;
        }
        await self.executeCommand(command, process);
        self.emit("processingFinished");
        Promise.resolve();
    }

    /**
     * Executes a request on the Sun Grid Engine
     * @param {Process} process The process to execute
     */
    public async executeRemoteRequest(process: Process) {
        let self = this;
        try {
            for (let dataItem of process.data) {
                await self.remoteExecution.uploadFile((dataItem as DivaFile).path, process.rootFolder);
            }
            let command = self.buildRemoteCommand(process);
            process.id = Statistics.startRecording(process);
            command += " " + process.id + " " + process.rootFolder + " > /dev/null";
            self.remoteExecution.executeCommand(command);
            Promise.resolve();
        } catch (error) {
            Logger.log("error", error, "ExecutableHelper");
            Promise.reject(error);
        }
    }

    /**
     * Executes a request on a docker instance
     * @param {Process} process The process to execute
     */
    public static executeDockerRequest(process: Process): Promise<void> {
        return new Promise<void>(async (resolve, reject) => {
            process.id = Statistics.startRecording(process);
            process.remoteResultUrl = "http://" + nconf.get("docker:reportHost") + "/jobs/" + process.id;
            process.remoteErrorUrl = "http://" + nconf.get("docker:reportHost") + "/algorithms/" + process.algorithmIdentifier + "/exceptions/" + process.id;
            let serviceInfo = ServicesInfoHelper.getInfoByPath(process.req.originalUrl);
            try {
                resolve();
                DockerManagement.runDockerImage(process, serviceInfo.image_name);
            } catch (error) {
                reject(error);
            }
        });

    }

    /**
     * preprocess all the necessary information from the incoming POST request
     * This will either lead to the execution of one single image or the whole collection
     * @param {any} req The incoming request
     * @param {ProcessingQueue} processingQueue The Processing Queue to use
     * @param {string} executionType The execution type (e.g. java)
     */
    public async preprocess(req: any, processingQueue: ProcessingQueue, executionType: string): Promise<any> {
        return new Promise<any>(async (resolve, reject) => {
            try {
                let serviceInfo = ServicesInfoHelper.getInfoByPath(req.originalUrl);
                let collection = new Collection();
                let methodInfo = await IoHelper.openFile(nconf.get("paths:jsonPath") + req.originalUrl + path.sep + "info.json");
                collection.outputs = methodInfo.output;
                collection.method = serviceInfo.service;
                collection.name = RandomWordGenerator.generateRandomWord();
                collection.outputFolder = IoHelper.getOutputFolder(collection.name);
                collection.logFolder = IoHelper.getLogFolder(serviceInfo.path);
                collection.inputParameters = _.cloneDeep(req.body.parameters);
                collection.inputData = _.cloneDeep(req.body.data);
                collection.resultFile = nconf.get("paths:resultsPath") + path.sep + collection.name + ".json";
                this.setCollectionHighlighter(collection, req);
                collection.neededParameters = serviceInfo.parameters;
                collection.neededData = serviceInfo.data;
                //perform parameter matching on collection level
                await ParameterHelper.matchCollectionParams(collection, req);
                //create processes
                let index: number = 0;
                //check if some parameter expanding is needed

                collection.inputData = await ParameterHelper.expandDataWildcards(collection.inputData);

                for (let element of collection.inputData) {
                    let proc: Process = new Process();
                    proc.req = _.cloneDeep(req);
                    proc.type = executionType;
                    proc.algorithmIdentifier = serviceInfo.identifier;
                    proc.executableType = serviceInfo.executableType;
                    proc.outputFolder = collection.outputFolder + path.sep + "data_" + index + path.sep;
                    proc.inputHighlighters = _.cloneDeep(collection.inputHighlighters);
                    proc.neededParameters = _.cloneDeep(collection.neededParameters);
                    proc.neededData = _.cloneDeep(collection.neededData);
                    proc.parameters = _.cloneDeep(collection.parameters);
                    proc.remotePaths = _.cloneDeep(serviceInfo.remotePaths);
                    proc.outputs = collection.outputs;
                    proc.matchedParameters = _.cloneDeep(serviceInfo.paramOrder);
                    proc.method = collection.method;
                    proc.rootFolder = collection.name;
                    proc.methodFolder = path.basename(proc.outputFolder);
                    proc.programType = serviceInfo.programType;
                    proc.executablePath = serviceInfo.executablePath;
                    proc.resultType = serviceInfo.output;
                    proc.type = executionType;
                    //assign temporary file paths, these might change if existing results are found
                    proc.resultFile = IoHelper.buildResultfilePath(proc.outputFolder, proc.methodFolder);
                    proc.tmpResultFile = IoHelper.buildTempResultfilePath(proc.outputFolder, proc.methodFolder);
                    let now: Date = new Date();
                    proc.stdLogFile = IoHelper.buildStdLogFilePath(collection.logFolder, now);
                    proc.errLogFile = IoHelper.buildErrLogFilePath(collection.logFolder, now);
                    proc.resultLink = proc.buildGetUrl();

                    switch (proc.resultType) {
                        case "console":
                            proc.resultHandler = new ConsoleResultHandler(proc.resultFile);
                            break;
                        case "file":
                            proc.parameters.params["resultFile"] = proc.resultFile;
                            proc.resultHandler = new FileResultHandler(proc.resultFile, proc.tmpResultFile);
                            break;
                        case "none":
                            proc.resultHandler = new NoResultHandler(proc.resultFile);
                            break;
                    }
                    collection.processes.push(proc);
                    index++;
                    await ParameterHelper.matchProcessData(proc, element);
                    await ParameterHelper.matchOrder(proc);
                    //try to find existing results
                    await ParameterHelper.loadParamInfo(proc);
                    if (isNullOrUndefined(proc.resultFile)) {
                        await IoHelper.createFolder(proc.outputFolder);
                        proc.resultFile = IoHelper.buildResultfilePath(proc.outputFolder, proc.methodFolder);
                        proc.tmpResultFile = IoHelper.buildTempResultfilePath(proc.outputFolder, proc.methodFolder);
                        proc.resultLink = proc.buildGetUrl();
                        await ParameterHelper.saveParamInfo(proc);
                        await IoHelper.saveFile(proc.resultFile, { status: "planned" }, "utf8");
                        processingQueue.addElement(proc);
                    }
                    Logger.log("info", "finished preprocessing", "ExecutableHelper");
                }
                let results = [];
                for (let process of collection.processes) {
                    results.push({ "resultLink": process.resultLink });
                }
                if (isNullOrUndefined(collection.result)) {
                    collection.result = {
                        results: results,
                        collection: collection.name,
                        resultLink: collection.buildGetUrl(),
                        message: "This url is available for 24 hours",
                        status: "done"
                    };
                }
                await ResultHelper.saveResult(collection);
                resolve(collection.result);
            } catch (error) {
                reject(error);
            }
        });

    }


    /**
    * Get the execution type
    * @param {string} programType the type of the program
    * @returns {string} the executable code for this program type
    */
    private getExecutionType(programType: string): string {
        switch (programType) {
            case "java":
                return "java -Djava.awt.headless=true -Xmx4096m -jar";
            case "coffeescript":
                return "coffeescript";
            default:
                return "";
        }
    }

    /**
     * Set the highlighter object on a collection
     * @param {Collection} collection the collection to set the highlighter for
     * @param {*} req the incoming POST request
     */
    private setCollectionHighlighter(collection: Collection, req: any): void {
        if (req.body.parameters != null && req.body.parameters.highlighter != null) {
            collection.inputHighlighters = _.cloneDeep(req.body.parameters.highlighter);
        } else {
            collection.inputHighlighters = {};
        }
    }

}