/**
 * Created by Marcel Würsch on 02.11.16.
 */
"use strict";

import * as _ from "lodash";
import * as nconf from "nconf";
import { IoHelper } from "./ioHelper";

/**
 * helper class for all service information
 * 
 * @export
 * @class ServicesInfoHelper
 */
export class ServicesInfoHelper {

    /**
     * the content of the service information file
     * 
     * @static
     * 
     * @memberOf ServicesInfoHelper
     */
    static fileContent = IoHelper.openFile(nconf.get("paths:servicesInfoFile"));

    /**
     * get service information for a route
     * 
     * @static
     * @param {string} path the route to check
     * @returns {*} the service information
     * 
     * @memberOf ServicesInfoHelper
     */
    static getInfoByPath(path: string): any {
        this.reload();
        let serviceInfo = this.fileContent.services.filter(function (item: any) {
            return item.path === path;
        });

        return serviceInfo[0];
    }

    /**
     * get service information for a method
     * 
     * @static
     * @param {string} name the name of the method
     * @returns {*} the service information
     * 
     * @memberOf ServicesInfoHelper
     */
    static getInfoByName(name: string): any {
        this.reload();
        let serviceInfo = this.fileContent.services.filter(function (item: any) {
            return item.service === name;
        });
        return serviceInfo[0];
    }

    /**
     * get service information based on a method identifier
     * 
     * @static
     * @param {string} identifier the identifier
     * @returns {*} the service information
     * 
     * @memberOf ServicesInfoHelper
     */
    static getInfoByIdentifier(identifier: string): any {
        this.reload();
        let serviceInfo = this.fileContent.services.filter(function (item: any) {
            return item.identifier === identifier;
        });
        return serviceInfo[0];
    }

     /**
     * update the service information file
     * 
     * @static
     * @param {*} newData the new service information object
     * 
     * @memberOf ServicesInfoHelper
     */
    static async update(newData: any): Promise<void> {
        await IoHelper.saveFile(nconf.get("paths:servicesInfoFile"), newData, "utf8");
    }

    /**
     * reload the content of the service information
     * 
     * @static
     * 
     * @memberOf ServicesInfoHelper
     */
    static reload(): void {
        this.fileContent = IoHelper.openFile(nconf.get("paths:servicesInfoFile"));
    }

    /**
     * check if a method requires input images or file
     * 
     * @static
     * @param {*} serviceInfo the service information
     * @returns {boolean} indication wheter or not the method requires file
     * 
     * @memberOf ServicesInfoHelper
     */
    static methodRequireImages(serviceInfo: any): boolean {
        let fileParameters = _.filter(serviceInfo.parameters, function (parameter: string) {
            return ["inputImage"].indexOf(String(_.values(parameter)[0])) >= 0;
        });

        return fileParameters.length > 0;
    }

    static methodRequireData(serviceInfo: any): boolean {
        let fileParameters = _.filter(serviceInfo.parameters, function (parameter: string) {
            return ["inputFile"].indexOf(String(_.values(parameter)[0])) >= 0;
        });

        return fileParameters.length > 0;
    }

    /**
     * check if a method requires json
     * 
     * @static
     * @param {*} serviceInfo the service information
     * @returns {boolean} indication wheter or not the method requries data
     * 
     * @memberOf ServicesInfoHelper
     */
    static methodRequireJson(serviceInfo: any): boolean {
        let fileParameters = _.filter(serviceInfo.parameters, function (parameter: string) {
            return ["json"].indexOf(String(_.values(parameter)[0])) >= 0;
        });
        return fileParameters.length > 0;
    }
}