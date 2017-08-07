/**
 * Created by Marcel Würsch on 02.11.16.
 */

"use strict";
import { IoHelper } from "../helper/ioHelper";
import IProcess = require("./iProcess");
import IResultHandler = require("../helper/resultHandlers/iResultHandler");
import * as express from "express";
/**
 *Class representing a process to be executed
 */
export class Process implements IProcess {
    /**
     * the process identifier
     * 
     * @type {string}
     * @memberOf Process
     */
    public id: string;

    /**
     * the running process number
     * 
     * @type {number}
     * @memberOf Process
     */
    public number: number;

    /**
     * the identifier of the applied algorithm
     * 
     * @type {string}
     * @memberOf Process
     */
    public algorithmIdentifier: string;

    /**
     * the executable type
     * 
     * @type {string}
     * @memberOf Process
     */
    public executableType: string;

    /**
     * the incoming POST request
     * 
     * @type {express.Request}
     * @memberOf Process
     */
    public req: express.Request = null;

    /**
     *  the name of the method
     * 
     * @type {string}
     * @memberOf Process
     */
    public method: string;


    /**
     * the root folder
     * 
     * @type {string}
     * @memberOf Process
     */
    public rootFolder: string;

    /**
     * the output folder to use
     * 
     * @type {string}
     * @memberOf Process
     */
    public outputFolder: string;

    /**
     * the folder of the method
     * 
     * @type {string}
     * @memberOf Process
     */
    public methodFolder: string;

    /**
     * the needed parameters for the method
     * 
     * @type {*}
     * @memberOf Process
     */
    public neededParameters: any;

    /**
     * the needed data for the method
     * 
     * @type {*}
     * @memberOf Process
     */
    public neededData: any;

    /**
     * the provided input parameters
     * 
     * @type {*}
     * @memberOf Process
     */
    public inputParameters: any;

    /**
     * the provided highlighter information
     * 
     * @type {*}
     * @memberOf Process
     */
    public inputHighlighters: any;

    /**
     * the input folder
     * 
     * @type {string}
     * @memberOf Process
     */
    public inputFolder: string;

    /**
     * the global parameter values
     * 
     * @type {*}
     * @memberOf Process
     */
    public parameters: any;

    /**
     * the data to use
     * @type {*}
     * @memberOf Process
     */
    public data: any;

    /**
     * All parameter values in the correct order
     * @type {*}
     * @memberOf Process
     */
    public matchedParameters: any;

    /**
     * the type of the program
     * 
     * @type {string}
     * @memberOf Process
     */
    public programType: string;

    /**
     * the path to the executable
     * 
     * @type {string}
     * @memberOf Process
     */
    public executablePath: string;

    /**
     * the result handler to use after computation is done
     * 
     * @type {IResultHandler}
     * @memberOf Process
     */
    public resultHandler: IResultHandler;

    /**
     * the result type
     * 
     * @type {string}
     * @memberOf Process
     */
    public resultType: string;

    /**
     * the path to the result file
     * 
     * @type {string}
     * @memberOf Process
     */
    public resultFile: string;

    /**
     * the path to the temporary result file
     * 
     * @type {string}
     * @memberOf Process
     */
    public tmpResultFile: string;

    /**
    * the computed results
    * 
    * @type {*}
    * @memberOf Process
    */
    public result: any;


    /**
     * the defined outputs
     * 
     * @type {any[]}
     * @memberof Process
     */
    public outputs: any[];

    /**
     * the static url to the results
     * 
     * @type {string}
     * @memberOf Process
     */
    public resultLink: string;

    /**
     * the url to POST results to
     * 
     * @type {string}
     * @memberOf Process
     */
    public remoteResultUrl: string;

    /**
     * the url to POST errors to
     * 
     * @type {string}
     * @memberOf Process
     */
    public remoteErrorUrl: string;

    /**
     * the remote paths to use for certain parameters
     * 
     * @type {*}
     * @memberOf Process
     */
    public remotePaths: any;

    /**
     * the type of process
     * 
     * @type {string}
     * @memberOf Process
     */
    public type: string;

    /**
     * the standard output
     * 
     * @type {*}
     * @memberOf Process
     */
    public stdout: any;

    /**
     * the standard input
     * 
     * @type {*}
     * @memberOf Process
     */
    public stdin: any;


    /**
     * Path to the log file of the standard output 
     * 
     * @type {string}
     * @memberof Process
     */
    public stdLogFile: string;

    /**
     * Path to the log file of the error output
     * 
     * @type {string}
     * @memberof Process
     */
    public errLogFile: string;



    /**
     * build the static url to access the result file
     * 
     * @returns {string}
     * 
     * @memberOf Process
     */
    buildGetUrl(): string {
        return IoHelper.getStaticResultUrlFull(this.resultFile);
    }
}