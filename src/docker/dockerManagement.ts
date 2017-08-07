import { DivaCollection } from '../models/divaCollection';
/**
 * Created by Marcel Würsch on 04.11.16.
 */

import * as _ from "lodash";
import { AlgorithmManagement } from "../management/algorithmManagement";
import * as archiver from "archiver";
import * as fs from "fs";
import * as nconf from "nconf";
import * as path from "path";
import * as DOCKER from "dockerode";
import * as mime from "mime";
import { Logger } from "../logging/logger";
import { DivaFile } from '../models/divaFile';
import * as os from "os";
import { Process } from "../processingQueue/process";
import { DivaError } from "../models/divaError";
import * as stream from "stream";
/**
 * A class for managing, and running docker images
 */
export class DockerManagement {
    /**
     * The Docker communication object
     */
    static docker = new DOCKER({ host: nconf.get("docker:host"), port: nconf.get("docker:port") });

    /**
     * Create a new image
     * 
     * @param {string} inputFolder The folder where the container contents are stored
     * @param {string} imageName The name of the image to create
     */
    static buildImage(inputFolder: string, imageName: string): Promise<number> {
        return new Promise<number>((resolve, reject) => {
            //create tar file
            let output = fs.createWriteStream(inputFolder + path.sep + "archive.tar");
            let archive = archiver("tar");
            let self = this;

            //close handler for the archive
            output.on("close", function () {
                //create the docker image using the built archive file
                self.docker.buildImage(inputFolder + path.sep + "archive.tar", {
                    t: imageName,
                    q: true
                }, function (error: any, response: any) {
                    //callback handler
                    let id = -1;
                    let hasError: boolean = false;
                    let errorMessage: string = "";
                    if (error != null) {
                        Logger.log("error", error, "DockerManagement");
                        errorMessage = error;
                        hasError = true;
                    } else {
                        response.on("data", function (data: any) {
                            if (hasError) {
                                return reject(new DivaError(errorMessage, 500, "DockerError"));
                            }
                            try {
                                let json = JSON.parse(data.toString());
                                let id = json.stream.split(":")[1].replace(os.EOL, "");
                                Logger.log("trace", "built new image with id: " + id, "DockerManagement");
                            } catch (error) {
                                hasError = true;
                                return reject(new DivaError(data.toString(), 500, "DockerError"));
                            }
                        });
                        response.on("end", function () {
                            if (!hasError) {
                                Logger.log("info", "successfully build the image", "DockerManagement");
                                resolve(id);
                            }
                        });
                    }
                });
            });
            //build an archive of the current contents of the inputFolder
            archive.pipe(output);

            archive.directory(inputFolder + path.sep, false);
            //build the archive --> this will trigger the "close" handler
            archive.finalize();
        });


    }


    /**
     * Remove an image from the docker server
     * @param {String} imageName the name of the image to remove
     */
    static removeImage(imageName: string): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            this.docker.getImage(imageName).remove(function (err: any, data: any) {
                if (err != null) {
                    Logger.log("error", err, "DockerManagement");
                    return reject(new DivaError(err.message, 500, "DockerError"));
                }
                resolve();
            });
        });
    }

    /**
     * Create and save a Dockerfile based on the algorithm information
     *
     * @param {any} algorithmInfos an object containing all necessary algorithm information
     * @param {string} outputFolder The folder where the Dockerfile will be saved
     */
    static createDockerFile(algorithmInfos: any, outputFolder: string): void {
        let content: string = "FROM " + algorithmInfos.method.environment + os.EOL +
            'MAINTAINER marcel.wuersch@unifr.ch' + os.EOL;

        switch (nconf.get("baseImages:" + algorithmInfos.method.environment)) {
            case "apk":
                content += 'RUN apk update' + os.EOL +
                    'RUN apk add curl bash' + os.EOL;
                break;
            case "apt":
                content += 'RUN apt-get update' + os.EOL +
                    'RUN apt-get install bash jq wget unzip curl -y' + os.EOL;
                break;
        }

        content += 'RUN mkdir -p /data/output' + os.EOL +
            'COPY . /data' + os.EOL +
            'RUN unzip /data/algorithm.zip -d /data' + os.EOL;

        switch (nconf.get("baseImages:" + algorithmInfos.method.environment)) {
            case "apt":
                content += 'RUN apt-get clean && rm -rf /tmp/* /var/lib/apt/lists/* /var/tmp/* .git' + os.EOL;
                break;
        }
        content += 'WORKDIR /data' + os.EOL;
        content += 'RUN chmod +x *' + os.EOL;
        fs.writeFileSync(outputFolder + path.sep + "Dockerfile", content);
    }

    /**
     * Create the bash script that will be started once the docker image is executed
     *
     * @param {string} identifier
     * @param {any} algorithmInfos
     * @param {outputFolder} outputFolder
     */
    static createBashScript(identifier: string, algorithmInfos: any, outputFolder: string): void {
        let content: string = '#!/bin/bash' + os.EOL;
        content += 'echo ' + os.EOL;
        content += 'echo ------------------' + os.EOL;
        content += 'echo BEGINNING OF DIVASERVICES LOG RECORDING' + os.EOL;
        content += 'echo ------------------' + os.EOL;

        //input count starts with 3. Params 1 and 2 are fix used
        // 1: resultResponseUrl
        // 2: errorResponseUrl
        let inputCount: number = 3;

        //check if additional files need to be downloaded
        let index = 0;
        for (let input of algorithmInfos.input) {
            let key = _.keys(algorithmInfos.input[index])[0];
            if (['json', 'file', 'inputFile'].indexOf(key) >= 0) {
                //content += String((inputCount + index)) + '=$' + (inputCount + index) + os.EOL;
                content += 'curl -vs -o /data/' + input[key].name + '.' + mime.extension(input[key].options.mimeType) + ' $' + (inputCount + index) + " 2>/dev/null" + os.EOL;
                content += input[key].name + '="${' + (inputCount + index) + '##*/}"' + os.EOL;
                content += 'mv /data/' + input[key].name + '.' + mime.extension(input[key].options.mimeType) + ' /data/$' + input[key].name + os.EOL;
                content += 'echo ' + input[key].name + ' is using file: ' + '$' + (inputCount + index) + os.EOL;
                AlgorithmManagement.addRemotePath(identifier, input[key].name, "/data/$" + input[key].name);
            } else if (['folder'].indexOf(key) >= 0) {
                content += 'curl -vs -o /data/' + input[key].name + '.zip' + ' $' + (inputCount + index) + " 2>/dev/null" + os.EOL;
                content += 'echo ' + input[key].name + ' is using file: ' + '$' + (inputCount + index) + os.EOL;
                AlgorithmManagement.addRemotePath(identifier, input[key].name, "/data/" + input[key].name + "/");
            }
            index++;
        }
        index = 0;
        //check for unzipping
        for (let input of algorithmInfos.input) {
            let key = _.keys(algorithmInfos.input[index])[0];
            if (['folder'].indexOf(key) >= 0) {
                content += 'unzip /data/' + input[key].name + '.zip' + ' -d /data/' + input[key].name + os.EOL;
            }
            index++;
        }

        //add the correct execution string
        switch (algorithmInfos.method.executableType) {
            case "java":
                content += 'java -Djava.awt.headless=true -Xmx4096m -jar /data/' + algorithmInfos.method.executable_path + ' ';
                break;
            case "coffeescript":
                content += 'coffee ' + algorithmInfos.method.executable_path + ' ';
                break;
            case "bash":
            case "matlab":
                content += '/data/' + algorithmInfos.method.executable_path + ' ';
                break;
        }

        //add all parameters
        index = 0;
        for (let input of algorithmInfos.input) {
            let key = _.keys(algorithmInfos.input[index])[0];
            let value = ((_.values(algorithmInfos.input[index])[0]) as any).name;
            if (nconf.get("reservedWords").indexOf(key) >= 0 && nconf.get("docker:replacePaths").indexOf(key) >= 0) {
                content += this.getDockerInput(key) + " ";
                inputCount++;
            } else if (nconf.get("reservedWords").indexOf(key) >= 0 && !(nconf.get("docker:replacePaths").indexOf(key) >= 0)) {
                if (AlgorithmManagement.hasRemotePath(identifier, value)) {
                    content += AlgorithmManagement.getRemotePath(identifier, value) + " ";
                } else if (key === "highlighter") {
                    content += "${" + inputCount++ + "} " + "${" + inputCount++ + "} " + "${" + inputCount++ + "} " + "${" + inputCount++ + "} " + "${" + inputCount++ + "} " + "${" + inputCount++ + "} " + "${" + inputCount++ + "} " + "${" + inputCount++ + "} ";
                } else {
                    content += "${" + inputCount + "} ";
                }
                inputCount++;
            } else {
                if (key === "highlighter") {
                    content += "${" + inputCount++ + "} " + "${" + inputCount++ + "} " + "${" + inputCount++ + "} " + "${" + inputCount++ + "} " + "${" + inputCount++ + "} " + "${" + inputCount++ + "} " + "${" + inputCount++ + "} " + "${" + inputCount++ + "} ";
                } else {
                    content += "${" + inputCount + "} ";
                    inputCount++;
                }
            }
            index++;
        }
        content += os.EOL;
        //add the response sending information
        content += 'if [ -s "/data/error.txt" ]' + os.EOL;
        content += 'then' + os.EOL;
        content += '    curl -vs -H "Content-Type: text/plain" --data @/data/error.txt $2' + " 2>/dev/null" + os.EOL;
        content += 'fi' + os.EOL;
        content += 'if [ -s "/data/result.json" ]' + os.EOL;
        content += 'then' + os.EOL;
        content += '    curl -vs -H "Content-Type: application/json" --data @/data/result.json $1' + " 2>/dev/null" + os.EOL;
        content += 'fi' + os.EOL;
        content += 'echo ------------------' + os.EOL;
        content += 'echo END OF DIVASERVICES LOG RECORDING' + os.EOL;
        content += 'echo ------------------' + os.EOL;
        fs.writeFileSync(outputFolder + path.sep + "script.sh", content);
    }

    /**
     * Executes a docker image
     * This method makes use of [docker run](@link https://docs.docker.com/engine/reference/run/)
     *
     * @param {Process} process The process to run
     * @param {string} imageName The name of the image to use
     */
    static runDockerImage(process: Process, imageName: string): Promise<void> {
        return new Promise<void>(async (resolve, reject) => {
            let params = process.matchedParameters;
            //The string passed to the executable containing all parameters
            let executableString = "";

            //get remote path keys
            let remoteKeys = [];
            for (let remote of process.remotePaths) {
                remoteKeys.push(_.keys(remote)[0]);
            }

            //add the actual parameters
            for (let param of params) {
                let key = _.keys(param)[0];
                let value = param[key];
                if (key === "highlighter") {
                    //handle highlighters
                    executableString += _.map(value.split(" "), function (item: any) {
                        return item;
                    }).join(" ");
                    executableString += " ";
                } else if (value instanceof DivaFile) {
                    //handle data parameters
                    executableString += (value as DivaFile).url + ' ';
                } else if (value instanceof DivaCollection) {
                    executableString += (value as DivaCollection).zipUrl + ' ';
                } else {
                    //handle regular parameters
                    executableString += value + ' ';
                }
            }


            //build the command
            let command = './script.sh ' + process.remoteResultUrl + ' ' + process.remoteErrorUrl + ' ' + executableString;
            Logger.log("info", command, "DockerManagement");
            //run the docker image (see: https://docs.docker.com/engine/reference/run/)
            let container = null;
            try {
                var logStream: stream.Writable = new stream.Writable();
                var errLogStream: stream.Writable = new stream.Writable();
                var logFileStream = fs.createWriteStream(process.stdLogFile);
                var errFileStream = fs.createWriteStream(process.errLogFile);

                logStream._write = function (chunk: any, encoding: string, callback: Function) {
                    logFileStream.write(chunk.toString('utf8'));
                    callback();
                };

                errLogStream._write = function (chunk: any, encoding: string, callback: Function) {
                    errFileStream.write(chunk.toString('utf8'));
                    callback();
                };

                let container: DOCKER.Container = await this.docker.run(imageName, ['-c', command], [logStream, errLogStream], { Tty: false, entrypoint: '/bin/sh', Memory: (nconf.get("docker:maxMemory") * 1024 * 1024) }, null);

                if (container.output.StatusCode !== 0) {
                    AlgorithmManagement.recordException(process.algorithmIdentifier, "error");
                    throw new Error("error processing the request");
                }
                if (process.type === "test" && container.output.StatusCode !== 0) {
                    AlgorithmManagement.updateStatus(null, "error", process.req.originalUrl, "Algorithm image did not execute properly");
                    //ResultHelper.removeResult(process);
                }
                await container.remove({ "volumes": true });
                resolve();
            } catch (error) {
                Logger.log("error", error, "DockerManagement");
                if (container != null) {
                    await container.remove({ "volumes": true });
                }
                return reject(new DivaError(error.message, 500, "DockerError"));
            }
        });
    }

    /**
     * 
     * @private
     * @static
     * @param {string} input the path that needs to be looked up
     * @returns {string} the path within the docker image
     * 
     * @memberOf DockerManagement
     */
    private static getDockerInput(input: string): string {
        return nconf.get("docker:paths:" + input);
    }
}