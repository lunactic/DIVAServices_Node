/**
 * Created by lunactic on 02.11.16.
 */
"use strict";

import * as async from "async";
import { IiifManifestParser } from "../parsers/iiifManifestParser";
import * as express from "express";
import { ImageHelper } from "../helper/imageHelper";
import { RandomWordGenerator } from "../randomizer/randomWordGenerator";
import { IoHelper } from "../helper/ioHelper";
import { Logger } from "../logging/logger";
import * as nconf from "nconf";
import * as path from "path";
import { Statistics } from "../statistics/statistics";
import { ResultHelper } from "../helper/resultHelper";
import { AlgorithmManagement } from "../management/algorithmManagement";
import { SchemaValidator } from "../validator/schemaValidator";
import md5 = require("md5");
import { DivaImage } from "../models/divaImage";
import { PostHandler } from "./postHandler";
import { GetHandler } from "./getHandler";

let router = express.Router();

//set up a special route for image uploading
router.post("/upload", function (req: express.Request, res: express.Response) {
    let numOfImages: number = 0;
    let counter: number = 0;
    async.each(req.body.images, function (image: any, callback: Function) {
        switch (image.type) {
            case "iiif":
                let iiifManifestParser = new IiifManifestParser(image.value);
                iiifManifestParser.initialize().then(function () {
                    //TODO: expand this to all ranges
                    numOfImages += iiifManifestParser.getAllImages(0).length;
                    callback();
                });
                break;
            default:
                numOfImages++;
                callback();
                break;
        }
        counter++;
    }, function (error: any) {
        let imageExists: boolean = false;
        if (numOfImages === 1 && req.body.images.type !== "iiif") {
            //check if image exists
            ImageHelper.imageExists(md5(req.body.images[0].value), function (err: any, response: any) {
                if (response.imageAvailable) {
                    send200(res, { collection: response.collection });
                    imageExists = true;
                }
            });
        }
        if (!imageExists) {
            //need to save the image
            let collectionName = RandomWordGenerator.generateRandomWord();
            IoHelper.createImageCollectionFolders(collectionName);
            ImageHelper.createCollectionInformation(collectionName, numOfImages);
            send200(res, { collection: collectionName });
            let process = {
                rootFolder: collectionName
            };
            let imageCounter: number = 0;
            req.body.images.forEach((image: any, index: number) => {
                switch (image.type) {
                    case "iiif":
                        let iiifManifestParser = new IiifManifestParser(image.value);
                        iiifManifestParser.initialize().then(function () {
                            //TODO improve to save all images
                            let images = iiifManifestParser.getAllImages(0);
                            images.forEach((inputImage: any, i: number) => {
                                ImageHelper.saveUrl(inputImage, collectionName + path.sep, imageCounter, function (image: DivaImage) {
                                    ImageHelper.addImageInfo(image.md5, image.path, collectionName);
                                    ImageHelper.updateCollectionInformation(collectionName, numOfImages, imageCounter++);
                                });
                            });
                        });
                        break;
                    case "url":
                        ImageHelper.saveUrl(image.value, collectionName, imageCounter, function (divaImage: DivaImage) {
                            ImageHelper.addImageInfo(divaImage.md5, divaImage.path, collectionName);
                            ImageHelper.updateCollectionInformation(collectionName, numOfImages, imageCounter);
                        });
                        imageCounter = imageCounter + 1;
                        break;
                    default:
                        ImageHelper.saveBase64(image, collectionName, imageCounter, function (divaImage: DivaImage) {
                            ImageHelper.addImageInfo(divaImage.md5, divaImage.path, collectionName);
                            ImageHelper.updateCollectionInformation(collectionName, numOfImages, imageCounter);
                        });
                        imageCounter = imageCounter + 1;
                        break;
                }
            });
        }
    });
});

router.post("/jobs/:jobId", function (req: express.Request, res: express.Response) {
    Logger.log("info", "jobs route called", "StandardRouter");
    let process = Statistics.getProcess(req.params.jobId);
    if (process != null) {
        Statistics.endRecording(req.params.jobId, process.req.originalUrl);
        async.waterfall([
            function (callback: Function) {
                process.result = req.body;
                ResultHelper.saveResult(process, callback);
            }, function (callback: Function) {
                process.resultHandler.handleResult(null, null, null, process, function (error: any, data: any, processId: string) {
                    if (error != null) {
                        callback(error);
                    } else {
                        callback(null);
                    }
                });
            }
        ], function (error: any) {
            if (error != null) {
                AlgorithmManagement.updateStatus(null, "error", process.req.originalUrl, error.statusMessage);
                sendError(res, error);
            } else if (process.type === "test") {
                SchemaValidator.validate(IoHelper.openFile(process.resultFile), "responseSchema", function (error: any) {
                    if (error != null) {
                        AlgorithmManagement.updateStatus(null, "error", process.req.originalUrl, error.statusText);
                        ResultHelper.removeResult(process);
                        sendError(res, error);
                    } else {
                        AlgorithmManagement.updateStatus(null, "ok", process.req.originalUrl, "");
                        ResultHelper.removeResult(process);
                        send200(res, { status: "valid" });
                    }
                });
            } else {
                res.status(200);
                res.send();
            }
        });
    } else {
        res.status(500);
        res.send();
    }
});

router.post("/validate/:schema", function (req: express.Request, res: express.Response, next: express.NextFunction) {
    switch (req.params.schema) {
        case "host":
            validate(req, res, "hostSchema");
            break;
        case "hostAlgorithm":
            validate(req, res, "algorithmSchema");
            break;
        case "response":
            validate(req, res, "responseSchema");
            break;
        case "detailsAlgorithm":
            validate(req, res, "detailsAlgorithmSchema");
            break;
        case "create":
            validate(req, res, "createSchema");
            break;
    }
});

router.post("*", function (req: express.Request, res: express.Response, next: express.NextFunction) {
    if (unlike(req, "/algorithm")) {
        PostHandler.handleRequest(req, function (error: any, response: any) {
            if (error == null) {
                response["statusCode"] = 202;
            }
            sendResponse(res, error, response);
        });
    } else {
        next();
    }
});

router.get("/collections/", function (req: express.Request, res: express.Response) {
    let collections = ImageHelper.getAllCollections();
    let collectionInfo = [];
    for (let collection of collections) {
        if (collection != "test") {
            collectionInfo.push({
                "collection": {
                    name: collection,
                    url: 'http://' + nconf.get("server:rootUrl") + "/collections" + "/" + collection
                }
            });
        }
    }
    let response = {
        collections: collectionInfo
    };
    send200(res, response);
});

router.get("/collections/:collection", function (req: express.Request, res: express.Response) {
    let collection = req.params.collection;
    if (ImageHelper.checkCollectionAvailable(collection)) {
        let status = ImageHelper.getCollectionInformation(collection);
        let images = ImageHelper.loadCollection(collection, null);
        let imgs = [];
        for (let image of images) {
            imgs.push({
                "image": {
                    md5: image.md5,
                    url: image.getImageUrl(collection + path.sep + "original" + path.sep)
                }
            });
        }
        status['images'] = imgs;
        send200(res, status);
    } else {
        let error = {
            statusCode: 404,
            statusText: "This collection is not available",
            errorType: "CollectionNotAvailable"
        };
        sendResponse(res, error, null);
    }
});

router.get("/collections/:collection/:execution", function (req: express.Request, res: express.Response) {
    //zip folder
    //TODO Fix here to distinguish between collection.hasFiles and collection.hasImages
    let filename = IoHelper.zipFolder(nconf.get("paths:imageRootPath") + path.sep + req.params.collection + path.sep + req.params.execution);
    res.status(200);
    res.json({ zipLink: "http://" + nconf.get("server:rootUrl") + "/static/" + filename });
});

router.get("/images/:collection", function (req: express.Request, res: express.Response) {
    let collection = req.params.collection;
    let images = ImageHelper.loadCollection(collection, null);
    let imgs = [];
    for (let image of images) {
        imgs.push({
            "image": {
                md5: image.md5,
                url: image.getImageUrl(collection + path.sep + "original")
            }
        });
    }
    let response = {
        collection: collection,
        images: imgs
    };
    sendResponse(res, null, response);
});

router.get("/images/check/:md5", function (req: express.Request, res: express.Response) {
    ImageHelper.imageExists(req.params.md5, function (error: any, response: any) {
        sendResponse(res, error, response);
    });
});

router.get("/images/results/:md5", function (req: express.Request, res: express.Response) {
    ImageHelper.imageExists(req.params.md5, function (error: any, response: any) {
        let err = null;
        if (response.imageAvailable) {
            response = ResultHelper.loadResultsForMd5(req.params.md5);
        } else {
            err = {
                statusCode: 404,
                statusText: "This result is not available",
                errorType: "ResultNotAvailable"
            };
        }
        sendResponse(res, err, response);
    });
});

//info routes
router.get("/information/general", function (req: express.Request, res: express.Response) {
    let general = IoHelper.openFile("conf/algorithmGeneral.json");
    sendResponse(res, null, general);
});

router.get("/information/input", function (req: express.Request, res: express.Response) {
    let input = IoHelper.openFile("conf/algorithmInput.json");
    sendResponse(res, null, input);
});

router.get("/information/method", function (req: express.Request, res: express.Response) {
    let method = IoHelper.openFile("conf/algorithmMethod.json");
    sendResponse(res, null, method);
});

//schema routes
router.get("/schemas/create", function (req: express.Request, res: express.Response) {
    let create = IoHelper.openFile("conf/schemas/createAlgorithmSchema.json");
    sendResponse(res, null, create);
});

router.get("/schemas/details", function (req: express.Request, res: express.Response) {
    let details = IoHelper.openFile("conf/schemas/detailsAlgorithmSchema.json");
    sendResponse(res, null, details);
});

router.get("/schemas/general", function (req: express.Request, res: express.Response) {
    let general = IoHelper.openFile("conf/schemas/generalAlgorithmSchema.json");
    sendResponse(res, null, general);
});

router.get("/openapi", function (req: express.Request, res: express.Response) {
    let swagger = IoHelper.openFile(nconf.get("paths:swaggerFile"));
    swagger = JSON.parse(JSON.stringify(swagger).replace(new RegExp("\\$BASEURL$\\", "g"), nconf.get("server:rootUrl")));
    sendResponse(res, null, swagger);
});

router.get("*", function (req: express.Request, res: express.Response, next: express.NextFunction) {
    if (unlike(req, "/algorithms")) {
        GetHandler.handleRequest(req, function (error: any, response: any) {
            sendResponse(res, error, response);
        });
    } else {
        next();
    }
});

function validate(req: express.Request, res: express.Response, schema: string) {
    SchemaValidator.validate(req.body, schema, function (error: any) {
        if (error != null) {
            sendError(res, error);
        } else {
            send200(res, { status: "valud" });
        }
    });
}

function sendResponse(res: express.Response, error: any, response: any) {
    if (error != null) {
        sendError(res, error);
    } else {
        sendWithStatus(res, response);
    }
}

function send200(res: express.Response, response: any) {
    res.status(200);
    try {
        res.json(JSON.parse(response));
    } catch (error) {
        res.json(response);
    }
}

function sendWithStatus(res: express.Response, response: any) {
    res.status(res.statusCode || 200);
    try {
        res.json(JSON.parse(response));
    } catch (error) {
        res.json(response);
    }
}

function sendError(res: express.Response, error: any) {
    res.status(error.statusCode || 500);
    let err = {
        status: error.statusCode,
        type: error.errorType,
        message: error.statusText
    };
    res.json(err);
}

function unlike(req: express.Request, path: string) {
    if (req.path.search(path) >= 0) {
        return false;
    } else {
        return true;
    }
}


export = router;