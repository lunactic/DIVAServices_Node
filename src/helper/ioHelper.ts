/**
 * Created by Marcel Würsch on 02.11.16.
 */


"use strict";

import { isNullOrUndefined } from 'util';
import * as archiver from "archiver";
import * as fsp from "fs-extra";
import * as fs from "fs";
import * as http from "http";
import * as https from "https";
import * as nconf from "nconf";
import * as path from "path";
import * as request from "request-promise";
let rmdir = require("rmdir");
let unzip = require("unzipper");
import * as url from "url";
import { Logger } from "../logging/logger";
import { DivaError } from "../models/divaError";

/**
 * Class handling all input/output
 * 
 * @export
 * @class IoHelper
 */
export class IoHelper {

    /**
     * checks if a file exists on the filesystem
     * 
     * @static
     * @param {string} filePath path of the file
     * @returns {boolean} boolean indicating wheter or not the file exists
     * 
     * @memberOf IoHelper
     */
    static async fileExists(filePath: string): Promise<boolean> {
        return new Promise<boolean>(async (resolve, reject) => {
            try {
                let stats = await fsp.stat(filePath);
                resolve(stats.isFile());
            } catch (error) {
                resolve(false);
            }
        });
    }

    /**
     * open a file a return its content
     * 
     * @static
     * @param {string} filePath the path of the file to open
     * @returns {*} the content of the file as JSON object
     * 
     * @memberOf IoHelper
     */
    static openFile(filePath: string): any {
        try {
            let stats = fsp.statSync(filePath);
            if (stats.isFile()) {
                let content = JSON.parse(fsp.readFileSync(filePath, "utf-8"));
                return content;
            } else {
                return null;
            }
        } catch (error) {
            Logger.log("error", "Could not read file: " + filePath, "IoHelper");
            return null;
        }
    }

    /**
     * save a file on the filesystem
     * 
     * @static
     * @param {string} filePath the file path
     * @param {*} content the content as JSON object
     * @param {string} encoding the encoding to use
     * 
     * @memberOf IoHelper
     */
    static async saveFile(filePath: string, content: any, encoding: string): Promise<void> {
        return new Promise<void>(async (resolve, reject) => {
            try {
                if (typeof (content) === "string") {
                    fsp.writeFileSync(filePath, content, encoding);
                } else {
                    fsp.writeFileSync(filePath, JSON.stringify(content, null, "\t"), encoding);
                }
                resolve();
            } catch (error) {
                Logger.log("error", "Could not write file due to error " + error, "IoHelper");
                reject(new DivaError("Error saving file", 500, "IoError"));
            }
        });
    }

    static async moveFile(oldPath: string, newPath: string): Promise<void> {
        return new Promise<void>(async (resolve, reject) => {
            await fsp.move(oldPath, newPath, { overwrite: true });
            resolve();
        });
    }

    /**
     * remove a file from the filesystem
     * 
     * @static
     * @param {string} file the file path to remove
     * 
     * @memberOf IoHelper
     */
    static async deleteFile(file: string): Promise<any> {
        return new Promise<any>((resolve, reject) => {
            try {
                if (fsp.existsSync(file)) {
                    fsp.unlinkSync(file);
                }
                resolve();
            } catch (error) {
                return reject(new DivaError("Error deleting a file", 500, "IoError"));
            }
        });
    }

    /**
     * create a folder on the filesystem (uses mkdir -p)
     * 
     * @static
     * @param {string} folder the folder to create
     * 
     * @memberOf IoHelper
     */
    static async createFolder(folder: string): Promise<void> {
        return new Promise<void>(async (resolve, reject) => {
            await fsp.mkdirs(folder);
            resolve();
        });
    }

    /**
     * remove a folder from the filesystem (removes content too)
     * 
     * @static
     * @param {string} folder the folder to remove
     * 
     * @memberOf IoHelper
     */
    static deleteFolder(folder: string): void {
        rmdir(folder, function () {
            Logger.log("info", "successfully deleted folder: " + folder, "IoHelper");
        });
    }

    /**
     * Download a file synchronously
     * 
     * @static
     * @param {string} fileUrl the file to download
     * @param {string} localFolder the local folder to save the file into
     * @param {string} localFilename the filename to assign the downloaded image
     * @returns {string} the full path to the file
     * 
     * @memberOf IoHelper
     */
    static downloadFileSync(fileUrl: string, localFolder: string, localFilename: string): string {
        http.get(fileUrl, function (response: http.IncomingMessage) {
            response.pipe(fsp.createWriteStream(localFolder + path.sep + localFilename));
        });
        return localFolder + path.sep + localFilename;
    }

    /**
     * Download a file asynchronously with an additional check if the filetype is correct
     * Performs a HTTP HEAD request to check the file type
     * 
     * @static
     * @param {string} fileUrl the remote url to download
     * @param {string} localFolder the local folder to save the file into
     * @param {string} fileType the expected file type
     * 
     * @memberOf IoHelper
     */
    static downloadFileWithTypecheck(fileUrl: string, localFolder: string, fileType: string): Promise<string> {
        return new Promise<string>(async (resolve, reject) => {
            try {
                await this.checkFileType(fileType, fileUrl);
                let filename = path.basename(url.parse(fileUrl).pathname);
                let file = fsp.createWriteStream(localFolder + path.sep + filename);
                switch (url.parse(fileUrl).protocol) {
                    case "http:":
                        http.get(fileUrl, function (response: http.IncomingMessage) {
                            response.pipe(file);
                            response.on("end", function () {
                                resolve(localFolder + path.sep + filename);
                            });
                        });
                        break;
                    case "https":
                        https.get(fileUrl, function (response: http.IncomingMessage) {
                            response.pipe(file);
                            response.on("end", function () {
                                resolve(localFolder + path.sep + filename);
                            });
                        });
                        break;
                }
            } catch (error) {
                return reject(new DivaError("Error downloading file from: " + fileUrl, 500, "IoError"));
            }
        });
    }

    /**
     * Create a zip file from a folder
     * 
     * @static
     * @param {string} folder the folder to compress
     * @param {string} filename the name of the zip file to generate
     * @returns {string} the filename of the compressed zip file
     * 
     * @memberOf IoHelper
     */
    static async zipFolder(folder: string, filename: string): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            let archive = archiver("zip", {});
            let folders = folder.split(path.sep);

            let fileName = folder + path.sep + filename;

            let output = fsp.createWriteStream(fileName);
            output.on("close", function () {
                resolve();
            });
            archive.on("error", function (error: Object) {
                Logger.log("error", JSON.stringify(error), "IoHelper");
                reject(error);
            });
            archive.pipe(output);

            for (var file of IoHelper.readFolder(folder + path.sep + "original")) {
                archive.append(fs.createReadStream(folder + path.sep + "original" + path.sep + file), { name: file });
            }
            archive.finalize();
        });
    }

    /**
     * unzip a compressed file
     * 
     * @static
     * @param {string} zipFile the path to the compressed file
     * @param {string} folder the folder to uncompress the files into
     * 
     * @memberOf IoHelper
     */
    static async unzipFile(zipFile: string, folder: string): Promise<void> {
        return new Promise<void>(async (resolve, reject) => {
            try {
                //await fsp.mkdirs(folder);
                fsp.createReadStream(zipFile).pipe(unzip.Extract({ path: folder })).on("finish", function () {
                    resolve();
                }).on("error", function (error: any) {
                    Logger.log("error", JSON.stringify(error), "IoHelper");
                });
            } catch (error) {
                Logger.log("error", JSON.stringify(error), "IoHelper");
                return reject(new DivaError("Error unzipping file", 500, "IoError"));
            }

        });

    }

    /**
     * read all files in a folder
     * 
     * @static
     * @param {string} path the folder to read the files from
     * @returns {string[]} an array of files within the folder
     * 
     * @memberOf IoHelper
     */
    static readFolder(path: string): string[] {
        try {
            let files = fsp.readdirSync(path);
            return files;
        } catch (error) {
            return null;
        }
    }

    /**
     * Create the local folder for an image collection
     * 
     * @static
     * @param {string} collection the name of the collection
     * 
     * @memberOf IoHelper
     */
    static async createFilesCollectionFolders(collection: string): Promise<void> {
        return new Promise<void>(async (resolve, reject) => {
            let rootFolder = nconf.get("paths:filesPath") + path.sep + collection + path.sep + "original";
            await fsp.mkdirp(rootFolder);
            resolve();
        });



    }

    /**
     * remove the collection folder for an image collection
     * 
     * @static
     * @param {string} collection the name of the collection
     * 
     * @memberOf IoHelper
     */
    static deleteImageCollectionFolders(collection: string): void {
        let rootFolder = nconf.get("paths:imageRootPath") + path.sep + collection + path.sep;
        rmdir(rootFolder, function (error: any) {
            if (error != null) {
                Logger.log("error", JSON.stringify(error), "IoHelper");
            }
        });
    }

    /**
     * get the output folder for a data collection
     * 
     * @static
     * @param {string} collectionName the name of the collection
     * @returns {string} the path of the folder
     * 
     * @memberOf IoHelper
     */
    static getOutputFolder(collectionName: string): string {
        let dataPath = nconf.get("paths:resultsPath");
        let rootPath = dataPath + path.sep + collectionName;
        return rootPath;
    }

    /**
     * gets the root folder for log files of this method
     * 
     * @static
     * @param {string} method the path to the method
     * @returns {string} the root log folder for this method
     * @memberof IoHelper
     */
    static getLogFolder(method: string): string {
        let logPath = nconf.get("paths:logPath");
        return logPath + method;
    }

    /**
     * compute the path for the result file
     * 
     * @static
     * @param {string} folder the folder name
     * @param {string} fileName the file name
     * @returns {string} the path of the result file
     * 
     * @memberOf IoHelper
     */
    static buildResultfilePath(folder: string, fileName: string): string {
        return folder + fileName + ".json";
    }

    /**
     * compute the temporary result file path
     * 
     * @static
     * @param {string} folder the folder name
     * @param {string} fileName the file name
     * @returns {string} the path of the temporary file
     * 
     * @memberOf IoHelper
     */
    static buildTempResultfilePath(folder: string, fileName: string): string {
        return folder + fileName + "_temp.json";
    }

    static buildStdLogFilePath(folder: string, now: Date): string {
        return folder + path.sep + now.getFullYear() + "_" + now.getMonth() + "_" + now.getDay() + "_" + now.getHours() + "_" + now.getMinutes() + "_" + now.getSeconds() + "_" + now.getMilliseconds() + "_std.log";
    }

    static buildErrLogFilePath(folder: string, now: Date): string {
        return folder + path.sep + now.getFullYear() + "_" + now.getMonth() + "_" + now.getDay() + "_" + now.getHours() + "_" + now.getMinutes() + "_" + now.getSeconds() + "_" + now.getMilliseconds() + "_err.log";
    }
    /**
     * get the static url for an image
     * 
     * @static
     * @param {string} folder the folder of the image
     * @param {string} filename the filename of the image
     * @returns {string} the static url to access this image
     * 
     * @memberOf IoHelper
     */
    static getStaticImageUrl(folder: string, filename: string): string {
        let rootUrl = nconf.get("server:rootUrl");
        let relPath = folder.replace(nconf.get("paths:resultsPath") + path.sep, "");

        return "http://" + rootUrl + "/results/" + relPath + filename;
    }

    /**
     * get the static url for an image
     * 
     * @static
     * @param {string} folder the folder of the image
     * @param {string} filename the filename of the image
     * @returns {string} the static url to access this image
     * 
     * @memberOf IoHelper
     */
    static getStaticResultFileUrl(folder: string, filename: string): string {
        let rootUrl = nconf.get("server:rootUrl");
        let relPath = folder.replace(nconf.get("paths:resultsPath") + path.sep, "");

        return "http://" + rootUrl + "/results/" + relPath + filename;
    }

    /**
     * get the static image url with a specific extension
     * 
     * @static
     * @param {string} folder the folder name
     * @param {string} filename the file name
     * @param {string} extension the image extension
     * @returns {string} the static url to access this image
     * 
     * @memberOf IoHelper
     */
    static getStaticImageUrlWithExt(folder: string, filename: string, extension: string): string {
        let rootUrl = nconf.get("server:rootUrl");
        return "http://" + rootUrl + "/images/" + folder + "/" + filename + "." + extension;
    }

    /**
     * get the static url to an image from a relative path
     *
     * @static
     * @param {string} relativeFilePath the relative path to the image
     * @returns {string} the static url to access this image
     *
     * @memberOf IoHelper
     */
    static getStaticImageUrlRelative(relativeFilePath: string): string {
        let rootUrl = nconf.get("server:rootUrl");
        return "http://" + rootUrl + "/images/" + relativeFilePath;
    }

    /**
     * get the static url to an image from a relative path
     *
     * @static
     * @param {string} relativeFilePath the relative path to the image
     * @returns {string} the static url to access this image
     *
     * @memberOf IoHelper
     */
    static getStaticResultUrlRelative(relativeFilePath: string): string {
        let rootUrl = nconf.get("server:rootUrl");
        return "http://" + rootUrl + "/results/" + relativeFilePath;
    }

    /**
     * Get the static url to an image from its absolute path
     * 
     * @static
     * @param {string} fullFilePath the absolute path to the image
     * @returns {string} the static url to access this image
     * 
     * @memberOf IoHelper
     */
    static getStaticResultUrlFull(fullFilePath: string): string {
        let relPath = fullFilePath.replace(nconf.get("paths:resultsPath") + path.sep, "");
        return this.getStaticResultUrlRelative(relPath);
    }

    /**
     * get the static url to an image from a relative path
     *
     * @static
     * @param {string} relativeFilePath the relative path to the image
     * @returns {string} the static url to access this image
     *
     * @memberOf IoHelper
     */
    static getStaticLogUrlRelative(relativeFilePath: string): string {
        let rootUrl = nconf.get("server:rootUrl");
        return "http://" + rootUrl + "/logs/" + relativeFilePath;
    }

    /**
     * Get the static url to an image from its absolute path
     * 
     * @static
     * @param {string} fullFilePath the absolute path to the image
     * @returns {string} the static url to access this image
     * 
     * @memberOf IoHelper
     */
    static getStaticLogUrlFull(fullFilePath: string): string {
        let relPath = fullFilePath.replace(nconf.get("paths:logPath") + path.sep, "");
        return this.getStaticLogUrlRelative(relPath);
    }    

    /**
     * Checks if the file type of a remote url matches the expected type
     * 
     * @static
     * @param {string} fileType the expected file type
     * @param {string} fileUrl the remote url 
     * 
     * @memberOf IoHelper
     */
    static checkFileType(fileType: string, fileUrl: string): Promise<any> {
        return new Promise<any>(async (resolve, reject) => {
            if (fileType != null && fileType.length > 0) {
                let response = await request.head(fileUrl);
                if (response["content-type"] !== fileType) {
                    Logger.log("error", "non matching file type", "IoHelper");
                    return reject(new DivaError("non matching file type", 500, "IoError"));
                } else {
                    Logger.log("info", "downloaded file: " + fileUrl, "IoHelper");
                    resolve();
                }
            } else {
                Logger.log("error", "no filetype provided", "IoHelper");
                return reject(new DivaError("no filetype provided", 500, "IoError"));
            }
        });
    }

}