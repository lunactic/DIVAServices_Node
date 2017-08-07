let server = require("../bin/www");
import * as nconf from "nconf";
import * as chai from "chai";
let chaiHttp = require("chai-http");
let should = chai.should();
import { exec } from "child_process";


process.env.NODE_ENV = 'dev';

chai.use(chaiHttp);

before((done) => {
    exec('./scripts/cleanUp.sh', (err: any, stdout: any, stderr: any) => {
        done();
    });
});

describe('Test DIVAServices endpoints', () => {

    beforeEach((done) => {
        exec('./scripts/cleanData.sh', (err: any, stdout: any, stderr: any) => {
            done();
        });
    });

    describe('GET /', () => {
        it('should return an empty array', (done) => {
            chai.request(server)
                .get('/')
                .end((err, res) => {
                    res.should.have.status(200);
                    res.body.should.be.a('array');
                    res.body.should.be.a('array').that.is.empty;
                    done();
                });
        });
    });

    describe('GET /collections', () => {
        it('should return an object with an empty collections array', (done) => {
            chai.request(server)
                .get('/collections')
                .end((err, res) => {
                    res.should.have.status(200);
                    res.body.should.be.a('object');
                    res.body.collections.should.be.a('array');
                    res.body.collections.should.be.a('array').that.is.empty;
                    done();
                });
        });
    });

    describe('POST /collections (upload data)', () => {
        it('should upload the data and then be visible when doing a GET', (done) => {
            let reqBody = {
                name: "test_collection",
                files: [
                    {
                        type: "url",
                        "value": "http://dl.dropboxusercontent.com/s/ri0t2h9eubxzs9h/pixel-GT-CS863.zip"
                    }
                ]
            };

            chai.request(server)
                .post('/collections')
                .set('content-type', 'application/json')
                .send(reqBody)
                .end((err, res, body) => {
                    res.should.have.status(200);
                    res.body.should.be.a('object');
                    res.body.should.have.property('collection');
                    res.body.collection.should.be.eql('test_collection');
                });
            setTimeout(() => {
                chai.request(server)
                    .get('/collections')
                    .end((err, res) => {
                        res.should.have.status(200);
                        res.body.should.be.a('object');
                        res.body.collections.should.be.a('array');
                        res.body.collections.length.should.be.eql(1);
                    });
                chai.request(server)
                    .get('/collections/test_collection')
                    .end((err, res) => {
                        res.should.have.status(200);
                        res.body.should.be.a('object');
                        res.body.should.have.property('percentage');
                        res.body.percentage.should.be.eql(100);
                        res.body.should.have.property('files');
                        res.body.files.should.be.a('array');
                        res.body.files.length.should.be.eql(10);
                        done();
                    });
            }, 5000);
        }).timeout(6000);
    });
});
