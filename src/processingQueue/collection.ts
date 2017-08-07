/**
 * Created by Marcel Würsch on 02.11.16.
 */
"use strict";
import { Process } from "./process";
import { IoHelper } from "../helper/ioHelper";
import IProcess = require("./iProcess");

/**
 * Class representing a collection
 */
export class Collection implements IProcess {

    /**
     * the method assigned to this collection
     * 
     * @type {string}
     * @memberOf Collection
     */
    public method: string;

    /**
     * the name of the collection 
     * 
     * @type {string}
     * @memberOf Collection
     */
    public name: string;

    /**
     * the static link to access this collection
     * 
     * @type {string}
     * @memberOf Collection
     */
    public outputLink: string;

    /**
     * the folder where this collection stores result
     * 
     * @type {string}
     * @memberOf Collection
     */
    public outputFolder: string;

    /**
     * all input parameters
     * 
     * @type {*}
     * @memberOf Collection
     */
    public inputParameters: any;

    /**
     * all input data
     * @type {*[]}
     * @memberOf Collection
     */
    public inputData: any[];

    /**
     * all input highlighter information
     * 
     * @type {*}
     * @memberOf Collection
     */
    public inputHighlighters: any;

    /**
     * the needed parameters for the method
     * 
     * @type {*}
     * @memberOf Collection
     */
    public neededParameters: any;

    /**
     * the needed data for the method
     * 
     * @type {*}
     * @memberOf Collection
     */
    public neededData: any;

    /**
     * the matched parameters
     * 
     * @type {*}
     * @memberOf Collection
     */
    public parameters: any;

    /**
     * the data to use
     * @type {*[]}
     * @memberOf Collection
     */
    public data: any[];

    /**
     * the expected outputs
     * 
     * @type {any[]}
     * @memberof Collection
     */
    public outputs: any[];

    /**
     * the processes created in this collection
     * 
     * @type {Process[]}
     * @memberOf Collection
     */
    public processes: Process[];

    /**
     * the results
     * 
     * @type {*}
     * @memberOf Collection
     */
    public result: any;

    /**
     * the collection result file
     * 
     * @type {string}
     * @memberOf Collection
     */
    public resultFile: string;

    /**
     * temporary collection result file
     * @type {string}
     * @memberOf Collection
     */
    public tmpResultFile: string;

    /**
     * the root folder of the collection
     * 
     * @type {string}
     * @memberOf Collection
     */
    public rootFolder: string;

    /**
     * The root folder for log files
     * 
     * @type {string}
     * @memberof Collection
     */
    public logFolder: string;

    constructor() {
        this.method = "";
        this.name = "";
        this.outputFolder = "";
        this.outputLink = "";
        this.inputParameters = {};
        this.inputData = [];
        this.inputHighlighters = [];
        this.neededParameters = {};
        this.neededData = [];
        this.parameters = {};
        this.data = [];
        this.processes = [];
        this.result = null;
        this.resultFile = "";
        this.rootFolder = "";
    }

    /**
     * build the static url to access the result file
     * 
     * @returns {string}
     * 
     * @memberOf Collection
     */
    buildGetUrl(): string {
        return IoHelper.getStaticResultUrlFull(this.resultFile);
    }
}