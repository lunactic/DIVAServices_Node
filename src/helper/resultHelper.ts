import { Logger } from '../logging/logger';
import { Collection } from '../processingQueue/collection';
import IProcess = require('../processingQueue/iProcess');
import { Process } from '../processingQueue/process';
import { IoHelper } from './ioHelper';
import { ParameterHelper } from './parameterHelper';

/**
 * Created by Marcel Würsch on 04.11.16.
 */

"use strict";

/**
 * Helper class for all result related things
 * 
 * @export
 * @class ResultHelper
 */
export class ResultHelper {

    /**
     * check if results for a process are available
     * 
     * @static
     * @param {Process} process the process to check
     * @returns {boolean} indication whether results are available or not
     * 
     * @memberOf ResultHelper
     */
    static async checkProcessResultAvailable(process: Process): Promise<boolean> {
        return new Promise<boolean>(async (resolve, reject) => {
            ParameterHelper.loadParamInfo(process);
            resolve(process.resultFile != null && await IoHelper.fileExists(process.resultFile));
        });
    }

    /**
     * load the results for a process / collection
     * 
     * @static
     * @param {IProcess} process the process to load results for
     * @returns {*}
     * 
     * @memberOf ResultHelper
     */
    static loadResult(process: IProcess): any {
        return IoHelper.openFile(process.resultFile);
    }

    /**
     * save the results for a process / collection
     * 
     * @static
     * @param {IProcess} info the process to save results for
     * 
     * @memberOf ResultHelper
     */
    static async saveResult(info: IProcess): Promise<any> {
        if (info instanceof Collection) {
            return await IoHelper.saveFile(info.resultFile, info.result, "utf8");
        }else {
            return await IoHelper.saveFile(info.tmpResultFile, info.result, "utf8");
        }
    }

    /**
     * delete the results for a process
     * 
     * @static
     * @param {Process} process the process to delete results for
     * 
     * @memberOf ResultHelper
     */
    static async removeResult(process: Process): Promise<void> {
        return new Promise<void>(async (resolve, reject) => {
            try {
                await ParameterHelper.removeParamInfo(process);
                IoHelper.deleteFolder(process.outputFolder);
                resolve();
            } catch (error) {
                Logger.log("error", error, "ResultHelper");
                reject(error);
            }
        });
    }
}