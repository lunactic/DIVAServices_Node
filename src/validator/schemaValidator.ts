/**
 * Created by Marcel Würsch on 02.11.16.
 */
"use strict";

import * as nconf from "nconf";
import * as jsonschema from "jsonschema";
import { Logger } from "../logging/logger";
import { DivaError } from '../models/divaError';

export class SchemaValidator {
    static validator = new jsonschema.Validator();

    static validate(input: Object, schema: string): Promise<any> {
        return new Promise<any>((resolve, reject) => {
            try {
                let errors = SchemaValidator.validator.validate(input, nconf.get(schema)).errors;
                if (errors.length > 0) {
                    return reject(new DivaError(JSON.stringify(errors[0].instance) + ":" + errors[0].message, 500, "ValidationError"));
                } else {
                    resolve();
                }
            } catch (error) {
                Logger.log("error", error, "SchemaValidator");
            }
        });

    }
}
