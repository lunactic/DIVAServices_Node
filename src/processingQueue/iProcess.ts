/**
 * Created by Marcel Würsch on 04.11.16.
 */

interface IProcess {
    method: string;
    outputFolder: string;
    inputParameters: any;
    inputHighlighters: any;
    neededParameters: any;
    parameters: any;
    result: any;
    resultFile: string;
    tmpResultFile: string;
    rootFolder: string;
    outputs: any[];
}

export = IProcess;