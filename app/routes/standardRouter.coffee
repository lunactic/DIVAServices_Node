# Router
# =======
#
# **Router** uses the [Express > Router](http://expressjs.com/api.html#router) middleware
# for handling all routing from DIVAServices.
#
# Copyright &copy; Marcel Würsch, GPL v3.0 licensed.

# Require Express Router
AlgorithmManagement = require '../management/algorithmManagement'
async = require 'async'
DockerManagement = require '../docker/dockerManagement'
ExecutableHelper = require '../helper/executableHelper'
GetHandler = require './getHandler'
ImageHelper = require '../helper/imageHelper'
IoHelper = require '../helper/ioHelper'
logger = require '../logging/logger'
nconf = require 'nconf'
path = require 'path'
PostHandler = require './postHandler'
ProcessingQueue = require '../processingQueue/processingQueue'
ResultHelper = require '../helper/resultHelper'
router = require('express').Router()
schemaValidator = require '../validator/schemaValidator'
ServicesInfoHelper = require '../helper/servicesInfoHelper'
Statistics = require '../statistics/statistics'
Upload = require '../upload/upload'


getHandler = new GetHandler()
postHandler = new PostHandler()

# Set up special route for image uploading
router.post '/upload', (req, res) ->
  if(req.body.image?)
    Upload.uploadBase64Image req.body.image, (err, result) ->
      res.json {md5: result.md5}
  else if(req.body.zip?)
    Upload.uploadBase64Zip req.body.zip, (err, result) ->
      res.json {collection: result}
  else if(req.body.url?)
    if(req.body.url.endsWith('zip'))
      Upload.uploadZip(req.body.url, (err, result) ->
        res.json {collection: result}
      )
    else
      Upload.uploadUrl req.body.url, (err, result) ->
        res.json {md5: result.md5}

router.post '/jobs/:jobId', (req, res, next) ->
  process = Statistics.getProcess(req.params.jobId)
  Statistics.endRecording(req.params.jobId, process.req.originalUrl)
  async.waterfall [
    (callback) ->
      process.result = req.body
      ResultHelper.saveResult(process, callback)
      return
    (callback) ->
      process.resultHandler.handleResult(null, null, null, process, (error, data, processId) ->
        if(error)
          callback error
        else
          callback null
        return
      )
  ], (err) ->
    if(err)
      AlgorithmManagement.updateStatus(null, 'error', process.req.originalUrl, error.statusMessage)
      sendError(res, err)
    else if(process.type is 'test')
      ioHelper = new IoHelper()
      schemaValidator.validate(ioHelper.loadFile(process.resultFile), 'responseSchema', (error) ->
        if error
          AlgorithmManagement.updateStatus(null, 'error', process.req.originalUrl, error)
          sendError(res, error)
        else
          AlgorithmManagement.updateStatus(null, 'ok', process.req.originalUrl)
          send200(res, {status: 'valid'})
      )
    else
      res.status '200'
      res.send()

router.post '/validate/:schema', (req, res, next) ->
  switch req.params.schema
    when 'host'
      validate(req, res, 'hostSchema')
    when 'hostAlgorithm'
      validate(req, res, 'algorithmSchema')
    when 'response'
      validate(req, res, 'responseSchema')
    when 'detailsAlgorithm'
      validate(req, res, 'detailsAlgorithmSchema')
    when 'create'
      validate(req, res, 'createSchema')


# Set up the routing for POST requests
router.post '*', (req, res, next) ->
  if(unlike(req, '/algorithms'))
    postHandler.handleRequest req, (err, response) ->
      if(!err)
        response['statusCode'] = 202
      sendResponse res, err, response
  else
    next()



#load all images from a collection
router.get '/image/:collection', (req, res) ->
  collection = req.params.collection
  images = ImageHelper.loadCollection(collection, false)
  imgs = []
  for image in images
    imgs.push('image': {
      md5: image.md5
      url: ImageHelper.getOutputImageUrl(collection + path.sep + 'original', image.name, image.extension)
    })
  response =
    collection: collection
    images: imgs
  sendResponse(res, null, response)

router.get '/image/check/:md5', (req, res) ->
  ImageHelper.imageExists req.params.md5, (err, response) ->
    sendResponse res, err, response

router.get '/collections/:collection/:execution', (req, res) ->
#zip folder
  ioHelper = new IoHelper()
  filename = ioHelper.zipFolder(nconf.get('paths:imageRootPath') + '/' + req.params.collection + '/' + req.params.execution)
  res.status '200'
  res.json ({zipLink: 'http://' + nconf.get('server:rootUrl') + '/static/' + filename})

router.get '/image/results/:md5', (req, res)->
  ImageHelper.imageExists req.params.md5, (err, response) ->
    if(response.imageAvailable)
      response = ResultHelper.loadResultsForMd5(req.params.md5)
    else
      err =
        statusCode: 404
        statusText: 'This result is not available'

    sendResponse res, err, response



#Info routes
router.get '/information/general', (req, res) ->
  ioHelper = new IoHelper()
  general = ioHelper.loadFile('conf/algorithmGeneral.json')
  sendResponse res, null, general

router.get '/information/input', (req, res) ->
  ioHelper = new IoHelper()
  input = ioHelper.loadFile('conf/algorithmInput.json')
  sendResponse res, null, input

router.get '/information/output', (req, res) ->
  ioHelper = new IoHelper()
  output = ioHelper.loadFile('conf/algorithmOutput.json')
  sendResponse res, null, output

router.get '/information/method', (req, res) ->
  ioHelper = new IoHelper()
  method = ioHelper.loadFile('conf/algorithmMethod.json')
  sendResponse res, null, method

# Set up the routing for GET requests
router.get '*', (req, res, next) ->
  if(unlike(req, '/algorithms'))
    getHandler.handleRequest req, (err, response) ->
      sendResponse res, err, response
  else
    next()


unlike = (req, path) ->
  if(req.path.contains(path))
    false
  else
    true
# ---
# **sendResponse**</br>
# Send response back to the caller </br>
# `params`
#   *res* response object from the express framework
#   *err* possible error message. If set a HTTP 500 will be returned
#   *response* the JSON response. If set a HTTP 200 will be returned
sendResponse = (res, err, response) ->
  if(err?)
    sendError(res, err)
  else
    sendWithStatus(res, response)


send200 = (res, response) ->
  res.status = 200
  try
    res.json JSON.parse(response)
  catch error
    res.json response


sendWithStatus = (res, response) ->
  res.status response.statusCode or 200
  #parse an unparsed json string to get a correct response
  try
    response = JSON.parse(response)
    res.json response
  catch error
    res.json response

sendError = (res, err) ->
  res.status err.statusCode or 500
  error =
    status: err.statusCode
    type: err.errorType
    message: err.statusText
  res.json error

validate = (req, res, schema) ->
  schemaValidator.validate(req.body, schema, (error) ->
    if error
      sendError(res, error)
    else
      send200(res, {status: 'valid'})
  )

# Expose router
module.exports = router
