/**
 * Created by Marcel Würsch on 03.11.16.
 */
"use strict";

import * as _ from "lodash";
import * as fs from "fs";
import { IoHelper } from "./ioHelper";
import md5 = require("md5");
import * as nconf from "nconf";
import * as path from "path";
import * as request from "request-promise";
import * as mime from "mime";
import { Logger } from "../logging/logger";
import { Process } from "../processingQueue/process";
import { DivaFile } from "../models/divaFile";
import { DivaError } from '../models/divaError';
import { isNullOrUndefined } from "util";

/**
 * A class for all file handling 
 * 
 * @export
 * @class FileHelper
 */
export class FileHelper {

    /**
     * The JSON object holding all file information
     * 
     * @static
     * 
     * @memberOf FileHelper
     */
    static filesInfo = JSON.parse(fs.readFileSync(nconf.get("paths:imageInfoFile"), "utf-8"));

    /**
     * Checks if an image exists on the file system
     * 
     * @static
     * @param {string} md5 the md5 hash of the image
     * 
     * @memberOf FileHelper
     */
    static fileExistsMd5(md5: string): Promise<any> {
        return new Promise<any>((resolve, reject) => {
            let filtered = this.filesInfo.filter(function (item: any) {
                return item.md5 === md5;
            });
            if (filtered.length > 0) {
                resolve({ imageAvailable: true, collection: filtered[0].collection });
            } else {
                resolve({ imageAvailable: false });
            }
        });
    }

    /**
     * 
     * @param path 
     */
    static fileExists(path: string): boolean {
        return fs.existsSync(path);
    }

    /**
     * Saves a file based on its base64 encoding
     * 
     * @static
     * @param {*} file  the file object containing the base64 string
     * @param {string} folder the folder to save the image into
     * @param {number} counter the running counter applied to this file
     * @param {string} [extension] the file extension (if available)
     * @returns {Promise<any>} 
     * @memberof FileHelper
     */
    static saveBase64(file: any, folder: string, counter: number, extension?: string): Promise<any> {
        return new Promise<any>((resolve, reject) => {
            let imagePath = nconf.get("paths:filesPath");
            let base64Data = file.value.replace(/^data:image\/png;base64,/, "");
            let md5String = md5(base64Data);

            let fileObject = new DivaFile();
            let fileFolder = imagePath + path.sep + folder + path.sep + "original" + path.sep;
            let fileName = file.name;
            let fileExtension;
            if (!isNullOrUndefined(extension)) {
                fileExtension = extension;
            } else {
                fileExtension = this.getImageExtensionBase64(base64Data);
            }
            fs.stat(fileFolder + fileName, function (err: any, stat: fs.Stats) {
                fileObject.folder = fileFolder;
                fileObject.filename = fileName;
                fileObject.extension = fileExtension;
                fileObject.path = fileFolder + fileName + "." + fileExtension;
                fileObject.md5 = md5String;
                if (err === null) {
                    resolve(file);
                } else if (err.code === "ENOENT") {
                    fs.writeFile(fileObject.path, base64Data, "base64", function (err: any) {
                        resolve(fileObject);
                    });
                } else {
                    Logger.log("error", "error saving the image", "ImageHelper");
                    return reject(new DivaError("Error while saving the image", 500, "FileError"));
                }
            });
        });
    }

    /**
     * Saves an file stored within a JSON object
     * 
     * @static
     * @param {*} file the JSON object of the image
     * @param {Process} process the process of this image
     * @param {string} filename the filename of this image
     * 
     * @memberOf FileHelper
     */
    static saveJson(file: any, process: Process, filename: string) {
        let base64Data = file.replace(/^data:image\/png;base64,/, "");
        fs.writeFileSync(process.outputFolder + path.sep + filename, base64Data, "base64");
    }


    static async downloadFile(url: string, filepath: string): Promise<void> {
        return new Promise<void>(async (resolve, reject) => {
            request.get(url).pipe(fs.createWriteStream(filepath)).on("finish", function () {
                resolve();
            });
        });
    }

    static async saveZipUrl(url: string, folder: string): Promise<DivaFile[]> {
        return new Promise<DivaFile[]>(async (resolve, reject) => {
            let divaFiles: DivaFile[] = [];
            let filePath = nconf.get("paths:filesPath");
            let tmpFilePath: string = filePath + path.sep + folder + path.sep + "data.zip";
            await this.downloadFile(url, tmpFilePath);
            await IoHelper.unzipFile(tmpFilePath, filePath + path.sep + folder + path.sep + "original");
            let files: string[] = IoHelper.readFolder(filePath + path.sep + folder + path.sep + "original");
            let imageCounter: number = 0;
            for (var file of files) {
                let divaFile = new DivaFile();
                let filename = file.split(".").shift();
                let base64 = fs.readFileSync(filePath + path.sep + folder + path.sep + "original" + path.sep + file, "base64");
                let md5String = md5(base64);
                divaFile.filename = filename;
                divaFile.folder = filePath + path.sep + folder + path.sep + "original" + path.sep;
                divaFile.extension = mime.extension(mime.lookup(file));
                divaFile.path = divaFile.folder + file;
                divaFile.md5 = md5String;

                await FileHelper.addFileInfo(divaFile.md5, divaFile.path, folder);
                await FileHelper.updateCollectionInformation(folder, files.length, ++imageCounter);

                divaFiles.push(divaFile);
            }
        });
    }

    /**
     * Download a file from a URL and save it on the filesystem
     * 
     * @static
     * @param {string} url the remote url of the image
     * @param {string} folder the local folder to store the image in
     * @param {number} counter the running counter that is assigned to this image
     * 
     * @memberOf FileHelper
     */
    static async saveFileUrl(url: string, folder: string, counter?: number, filename?: string): Promise<DivaFile> {
        return new Promise<DivaFile>(async (resolve, reject) => {
            let filePath = nconf.get("paths:filesPath");
            let file = new DivaFile();
            let tmpFilePath: string = "";
            let fileName: string = "";

            var headerResponse = await request.head(url);
            let fileExtension = "";
            //TODO: FIX PROBLEM HERE IF content-type == "application/octet-stream"
            if (headerResponse["content-type"] === "application/octet-stream") {
                //if conte-typpe === 'application/content-stream' we can not make use of it per RFC 2616 7.2.1
                // If the media type remains unknown, the recipient SHOULD treat it as type "application/octet-stream".
                fileExtension = url.split(".").pop();
            } else {
                fileExtension = mime.extension(headerResponse["content-type"]);
            }

            if (filename != null) {
                tmpFilePath = filePath + path.sep + "temp_" + filename + "." + fileExtension;
                fileName = filename;
            } else if (counter != null) {
                tmpFilePath = filePath + path.sep + "temp_" + counter + "." + fileExtension;
                fileName = "input" + counter;
            }

            await request(url).pipe(fs.createWriteStream(tmpFilePath));
            let base64 = fs.readFileSync(tmpFilePath, "base64");

            let md5String = md5(base64);
            let imgFolder = filePath + path.sep + folder + path.sep + "original" + path.sep;
            file.filename = fileName;
            file.folder = imgFolder;
            file.extension = fileExtension;
            file.path = imgFolder + fileName + "." + fileExtension;
            file.md5 = md5String;

            fs.stat(file.path, function (err: any, stat: fs.Stats) {
                if (err == null) {
                    fs.unlink(tmpFilePath);
                } else if (err.code === "ENOENT") {
                    fs.renameSync(tmpFilePath, file.path);
                }
                resolve(file);
            });
        });

    }

    /**
     * Saves a text file onto the file system
     * @param data the textual data to save
     * @param folder the folder to save the file in
     * @param extension the file extension
     * @param counter the data element counter
     * @param filename the filename
     */
    static saveFileText(data: string, folder: string, extension: string, counter?: number, filename?: string): Promise<DivaFile> {
        let self = this;
        return new Promise<DivaFile>(async (resolve, reject) => {
            let filesPath = nconf.get("paths:filesPath");
            let filePath: string;
            let file = new DivaFile();
            let fileName: string = "";

            if (filename != null) {
                filePath = filesPath + path.sep + folder + path.sep + "original" + path.sep + filename + "." + extension;
                fileName = filename;
            } else if (counter != null) {
                filePath = filesPath + path.sep + folder + path.sep + "original" + path.sep + counter + "." + extension;
                fileName = String(counter);
            }

            await IoHelper.saveFile(filePath, data, "utf-8");

            let base64 = fs.readFileSync(filePath, "base64");

            let md5String = md5(base64);
            let imgFolder = filePath + path.sep + folder + path.sep + "original" + path.sep;
            file.filename = fileName;
            file.folder = imgFolder;
            file.extension = extension;
            file.path = imgFolder + fileName + "." + extension;
            file.md5 = md5String;

            Logger.log("trace", "saved file", "FileHelper");
            resolve(file);
        });
    }


    /**
     * 
     * Get the name of all existing collections
     * 
     * @static
     * @returns {String[]} An array of collection names
     * 
     * @memberOf FileHelper
     */
    static getAllCollections(): String[] {
        let collections = [];

        let fileInfo: any = IoHelper.openFile(nconf.get("paths:imageInfoFile"));
        for (var file of fileInfo) {
            if (!(collections.indexOf(file.collection) > -1)) {
                collections.push(file.collection);
            }
        }
        return collections;
    }

    /**
     * Load specific files of a collection
     * 
     * @static
     * @param {string} collectionName The name of the collection
     * @param {string[]} hashes an array of md5 hashes for files to load
     * @returns {File[]} The array of loaded files
     * 
     * @memberOf FileHelper
     */
    static loadCollection(collectionName: string, hashes: string[]): DivaFile[] {
        let files: DivaFile[] = [];

        let filtered = null;

        if (hashes != null) {
            filtered = _.filter(this.filesInfo, function (file: any) {
                return file.collection === collectionName && _.includes(hashes, file.md5);
            });
        } else {
            filtered = _.filter(this.filesInfo, function (file: any) {
                return file.collection === collectionName;
            });
        }
        if (filtered.length > 0) {
            for (let item of filtered) {
                let file = DivaFile.CreateFile(collectionName, path.basename(item.file), item.md5);
                files.push(file);
            }
            return files;
        } else {
            Logger.log("error", "Tried to load collection: " + collectionName + " which does not exist", "ImageHelper");
            return [];
        }
    }

    /**
     * Save the information of an file into the file information file
     * 
     * @static
     * @param {string} md5 the md5 hash of the file
     * @param {string} file the filename of the file
     * @param {string} collection the collection the file belongs to
     * 
     * @memberOf FileHelper
     */
    static async addFileInfo(md5: string, file: string, collection: string): Promise<void> {
        return new Promise<void>(async (resolve, reject) => {
            this.filesInfo.push({ md5: md5, file: file, collection: collection });
            await this.saveFileInfo();
            resolve();
        });
    }

    /**
     * get information for a file
     * 
     * @static
     * @param {string} md5 the md5 hash of the file
     * @returns {*} the information belonging to this file
     * 
     * @memberOf FileHelper
     */
    static getFileInfo(md5: string): any {
        return _.find(this.filesInfo, function (info: any) {
            return info.md5 === md5;
        });
    }

    /**
     * save the file information file
     * 
     * @static
     * 
     * @memberOf FileHelper
     */
    static async saveFileInfo() {
        await IoHelper.saveFile(nconf.get("paths:imageInfoFile"), this.filesInfo, "utf-8");
    }


    /**
     * create the information for a collection
     * 
     * @static
     * @param {string} collectionName the name of the collection
     * @param {number} files the number of files belonging to this collection
     * 
     * @memberOf FileHelper
     */
    static async createCollectionInformation(collectionName: string, files: number) {
        let status = {
            statusCode: 110,
            statusMessage: "Downloaded 0 of " + files + " files",
            percentage: 0,
            totalFiles: files
        };
        await IoHelper.saveFile(nconf.get("paths:filesPath") + path.sep + collectionName + path.sep + "status.json", status, "utf-8");
    }


    /**
     * Add more files to a collection
     * 
     * @static
     * @param {string} collectionName the name of the collection
     * @param {number} newFiles the number of new files
     * @memberof FileHelper
     */
    static async addFilesCollectionInformation(collectionName: string, newFiles: number) {
        let statusFile = nconf.get("paths:filesPath") + path.sep + collectionName + path.sep + "status.json";
        let currentStatus = await IoHelper.openFile(statusFile);

        currentStatus.statusCode = 110;
        currentStatus.statusMessage = "Downloaded " + currentStatus.totalFiles + " of " + (currentStatus.totalFiles + newFiles) + " files";
        currentStatus.percentage = (currentStatus.totalFiles) / (currentStatus.totalFiles + newFiles);
        currentStatus.totalFiles = (currentStatus.totalFiles + newFiles);

        await IoHelper.saveFile(nconf.get("paths:filesPath") + path.sep + collectionName + path.sep + "status.json", currentStatus, "utf-8");
    }

    static async deleteCollection(collection: string): Promise<void> {
        return new Promise<void>(async (resolve, reject) => {
            let files: DivaFile[] = this.loadCollection(collection, null);
            for (var file of files) {
                _.remove(this.filesInfo, function (item: any) {
                    return item.md5 === file.md5 && item.collection === collection;
                });
                Logger.log("info", "delete file" + file.path);
            }
            await this.saveFileInfo();
            IoHelper.deleteFolder(nconf.get("paths:filesPath") + path.sep + collection);
        });
    }
    /**
     * Check if a collection exists
     * 
     * @static
     * @param {string} collection the name of the collection
     * @returns {boolean} indicator whether or not the collection exists
     * 
     * @memberOf FileHelper
     */
    static checkCollectionAvailable(collection: string): boolean {
        try {
            fs.statSync(nconf.get("paths:filesPath") + path.sep + collection);
            return true;
        } catch (error) {
            return false;
        }
    }

    /**
     * update the collection information
     * 
     * @static
     * @param {string} collection the name of the collection
     * @param {number} files the total number of files in the collection
     * @param {number} downloaded the number of downloaded files
     * 
     * @memberOf ImageHelper
     */
    static async updateCollectionInformation(collection: string, files: number, downloaded: number): Promise<void> {
        return new Promise<void>(async (resolve, reject) => {
            let status = {};
            if (downloaded !== files) {
                status = {
                    statusCode: 110,
                    statusMessage: "Downloaded " + downloaded + " of " + files + " files",
                    percentage: (downloaded / files) * 100
                };
            } else {
                status = {
                    statusCode: 200,
                    statusMessage: "Collection is available",
                    percentage: 100
                };
            }
            let statusFile = nconf.get("paths:filesPath") + path.sep + collection + path.sep + "status.json";
            await IoHelper.saveFile(statusFile, status, "utf-8");
            resolve();
        });
    }

    /**
     * Get information about a collection
     * 
     * @static
     * @param {string} collection the name of the collection
     * @returns {*} the file information for the collection
     * 
     * @memberOf ImageHelper
     */
    static getCollectionInformation(collection: string): any {
        let statusFile = nconf.get("paths:filesPath") + path.sep + collection + path.sep + "status.json";
        return IoHelper.openFile(statusFile);
    }

    /**
    * Get the image extension from a base64 string
    * 
    * @static
    * @param {string} base64 the base64 string
    * @returns {string} the file ending to use for the image type
    * 
    * @memberOf ImageHelper
    */
    static getImageExtensionBase64(base64: string): string {
        if (base64.indexOf("/9j/4AAQ") !== -1 || base64.indexOf("_9j_4AA") !== -1) {
            return "jpg";
        }
        if (base64.indexOf("iVBORw0KGgoAAAANSUhEU") !== -1) {
            return "png";
        }
    }
}