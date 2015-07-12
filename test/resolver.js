/* global after, before, describe, it */

'use strict';

var expect = require('expect');
var test = require('unit.js');
// var mock = require('./mock');
var Resolver = require('../lib/resolver');
var _ = {
  clone: require('lodash-compat/lang/clone'),
  defaults: require('lodash-compat/object/defaults')
}

var instance;

var fauxjax = require('faux-jax');
var petstoreJson = require('./spec/v2/petstore.json');
var dummyUrl = 'http://example.com/petstore.json'; // Just a random URL that doesn't exist
var anotherDummyUrl = 'http://example.com/another.json'; // Just a random URL that doesn't exist

var httpMock = function(url, opts) {
  if(!(this instanceof httpMock)) { return new httpMock(url, opts); }

  if(url && typeof url === 'object') {
    opts = arguments[0];
  }

  this.opts = _.defaults({}, opts, {
    log: false,
    url: url
  });
}

httpMock.destroyAll = function () {
  if(fauxjax._installed) {
    fauxjax.restore(); // Restore globals that were mocked
  }
}

httpMock.respondAll = function (req) {

  if(arguments > 1){
    req = _.defaults({
      url: arguments[0],
      code: arguments[1],
      headers: arguments[2],
      body: arguments[3],
      times: arguments[4]
    }, {
      headers: {},
      code: 200,
      body: ' ',
      times: undefined
    })
  }

  // Stringify JSON
  if(req.body && typeof req.body === 'object') {
    req.body = JSON.stringify(req.body);
  }

  httpMock.setup();
  this._requestCount = 0; // can be on the singleton

  // Mock out http module, and throw error if a request is made
  fauxjax.on('request', function (faux) {

    if(req.url !== faux.requestURL) {
      // only interested in our URL
      return;
    }

    if(++self._requestCount > req.times) {
      self.err('More than '+times+' request(s) made');
    }

    // no url, means we respond to ALL requests
    if(!req.url || faux.requestURL === req.url) {

      if(self.opts.log) {
        console.log( req.url, ' -- request(s) made',self._requestCount);
      }

      faux.respond(req.code, req.headers, req.body);
    } else {
      self.err('Expected "' + req.url + '" got "' + faux.requestURL);
    }
  });
}

httpMock.prototype.allowNoRequest = function() {
  var self = this;
  // Mock out http module, and throw error if a request is made
  httpMock.setup();
  fauxjax.once('request', function (req) {
    fauxjax.restore(); // Restore globals that were mocked
    self.err('Too many HTTP Requests');
  });
}

httpMock.prototype.respond = function(_req) {
}

httpMock.prototype.respondEmpty = function(times) {
  this.respond({
    times: times
  });
}

httpMock.prototype.err= function(msg) {
  var AssertionError = require('assertion-error');
  throw new AssertionError(msg)
}
httpMock.setup = function() {
  if(!fauxjax._installed) {
    fauxjax.install();
    fauxjax.setMaxListeners(22);
  }
}

httpMock.prototype.destroy = function() {
  if(fauxjax._installed) {
    fauxjax.restore(); // Restore globals that were mocked
  }
}

httpMock.prototype.respondJson= function(url, json, times) {

  if(url && typeof url === 'object') {
    url = null;
    json = arguments[0];
    times = arguments[1];
  }

  this.respond({
    url: url,
    body: json,
    times: times
  })
}

httpMock.prototype.respondJsonOnce= function(url, json) {
  this.respondJson(url, json, 1);
}

describe.only('swagger resolver', function () {

  // before(function (done) {
  //   mock.petstore(done, function (petstore, server){
  //     instance = server;
  //   });
  // });
  // after(function (done){
  //   instance.close();
  //   done();
  // });

  afterEach(function () {
    httpMock.destroyAll();
  });

  it('is OK without remote references', function (done) {
    var api = new Resolver();
    var spec = {};

    api.resolve(spec, function (spec, unresolved) {
      expect(Object.keys(unresolved).length).toBe(0);
      done();
    });
  });

  it('resolves a remote model property reference $ref', function (done) {
    httpMock().respondJson(dummyUrl, petstoreJson);
    var api = new Resolver();
    var spec = {
      definitions: {
        Pet: {
          properties: {
            category: { $ref: dummyUrl+'#/definitions/Category' }
          }
        }
      }
    };

    api.resolve(spec, function (spec) {
      expect(spec.definitions.Category).toExist();
      httpMock().destroy();
      done();
    });
  });

  it('doesn\'t die on a broken remote model property reference', function (done) {
    httpMock.respondAll(200, {}, ' '); // TODO: fix, why doesn't this work with 404? See lib/resolver.js

    var api = new Resolver();
    var spec = {
      definitions: {
        Pet: {
          properties: {
            category: { $ref: 'http://localhost:8000/v2/petstore.jsonZZZ#/definitions/Category' }
          }
        }
      }
    };

    api.resolve(spec, function (spec, unresolved) {
      expect(unresolved['http://localhost:8000/v2/petstore.jsonZZZ#/definitions/Category']).toEqual(
        {
          root: 'http://localhost:8000/v2/petstore.jsonZZZ',
          location: '/definitions/Category'
        }
      );
      httpMock().destroy();
      done();
    });
  });

  it('doesn\'t die on a broken remote model property reference path', function (done) {
    httpMock().respondEmpty(); // TODO: should handle 404
    var api = new Resolver();
    var spec = {
      definitions: {
        Pet: {
          properties: {
            category: { $ref: 'http://localhost:8000/v2/petstore.json#/definitionz/Category' }
          }
        }
      }
    };

    api.resolve(spec, function (spec, unresolved) {
      expect(unresolved['http://localhost:8000/v2/petstore.json#/definitionz/Category']).toEqual(
        {
          root: 'http://localhost:8000/v2/petstore.json',
          location: '/definitionz/Category'
        }
      );
      done();
    });
  });

  it('doesn\'t die on a broken remote model property reference path 2', function (done) {
    httpMock().respondJson(dummyUrl, petstoreJson); // TODO: fix, this request get's made 7 (hardcoded number) times

    var api = new Resolver();
    var spec = {
      definitions: {
        Pet: {
          properties: {
            category: { $ref: dummyUrl + '#/definition/Categoryzzz' }
          }
        }
      }
    };

    api.resolve(spec, function (spec, unresolved) {
      expect(unresolved[dummyUrl + '#/definition/Categoryzzz']).toEqual({
        root: dummyUrl,
        location: '/definition/Categoryzzz'
      });
      done();
    });
  });

  it('resolves a remote model property reference $ref in an array', function (done) {
    httpMock().respondJsonOnce(dummyUrl, petstoreJson);
    var api = new Resolver();
    var spec = {
      definitions: {
        Pet: {
          properties: {
            category: {
              type: 'array',
              items: { $ref: dummyUrl+'#/definitions/Category' }
            }
          }
        }
      }
    };

    // NOTE: removed root here, so it inlines
    api.resolve(spec, function (spec) {
      expect(spec.definitions.Category).toExist();
      done();
    });
  });

  it('resolves remote parameter post object $ref', function (done) {
    httpMock().respondJsonOnce(dummyUrl, petstoreJson);

    var api = new Resolver();
    var spec = {
      paths: {
        '/pet': {
          post: {
            parameters: [{
              in: 'body',
              name: 'body',
              required: false,
              schema: { $ref: dummyUrl+'#/definitions/Pet' }
            }]
          }
        }
      }
    };

    // Removed root, as there isn't one (the spec is inline)
    api.resolve(spec, function (spec) {
      expect(spec.definitions.Pet).toExist();
      done();
    });
  });

  it('resolves a remote response object $ref', function (done) {
    httpMock().respondJsonOnce(dummyUrl, petstoreJson);

    var api = new Resolver();
    var spec = {
      paths: {
        '/pet': {
          post: {
            responses: {
              200: {
                description: 'it worked!',
                schema: { $ref: dummyUrl+'#/definitions/Pet' }
              }
            }
          }
        }
      }
    };

    api.resolve(spec, function (spec) {
      expect(spec.definitions.Pet).toExist();
      expect(spec.paths['/pet'].post.responses['200'].schema.$ref).toBe('#/definitions/Pet');

      done();
    });
  });

  it('resolves a locally defined parameter $ref', function (done) {
    var api = new Resolver();
    var spec = {
      paths: {
        '/pet': {
          post: {
            parameters: [{
              $ref: '#/parameters/sharedSkip'
            }]
          }
        }
      },
      parameters: {
        sharedSkip: {
          name: 'skip',
          in: 'query',
          description: 'Results to skip',
          required: false,
          type: 'integer',
          format: 'int32'
        }
      }
    };

    api.resolve(spec, function (spec) {
      var params = spec.paths['/pet'].post.parameters;
      expect(params.length).toBe(1);

      var param = params[0];
      expect(param.name).toBe('skip');

      done();
    });
  });

  it('requests the spec file once, when resolving local parameters', function (done) {

    httpMock().allowNoRequest(); // will fail on any HTTP request

    var api = new Resolver();
    var spec = {
      swagger:'2.0',
      paths: {
        '/pet': {
          post: {
            parameters: [{
              $ref: '#/parameters/sharedSkip'
            }]
          }
        }
      },
      parameters: {
        sharedSkip: {
          name: 'skip',
          in: 'query',
          description: 'Results to skip',
          required: false,
          type: 'integer',
          format: 'int32'
        }
      }
    };
    api.resolve(spec, function (spec) {
      var params = spec.paths['/pet'].post.parameters;
      expect(params.length).toBe(1);

      var param = params[0];
      expect(param.name).toBe('skip');
      done();
    });
  });

  it('doesn\'t puke on a malformed locally defined parameter $ref', function (done) {
    httpMock().allowNoRequest();
    var api = new Resolver();
    var spec = {
      paths: {
        '/pet': {
          post: {
            parameters: [{
              $ref: '#/parameters/sharedSkipz'
            }]
          }
        }
      },
      parameters: {
        sharedSkip: {
          name: 'skip',
          in: 'query',
          description: 'Results to skip',
          required: false,
          type: 'integer',
          format: 'int32'
        }
      }
    };

    api.resolve(spec, dummyUrl, function (spec, unresolved) {
      expect(unresolved['#/parameters/sharedSkipz']).toEqual({
        root: dummyUrl,
        location: '/parameters/sharedSkipz' });
      done();
    });
  });

  it('resolves a remote defined parameter $ref', function (done) {

    // As the URLs are the same, no request should be made
    httpMock().allowNoRequest();

    var api = new Resolver();
    var spec = {
      paths: {
        '/pet': {
          post: {
            parameters: [{
              $ref: dummyUrl+'#/parameters/sharedSkip'
            }]
          }
        }
      },
      parameters: {
        sharedSkip: {
          name: 'skip',
          in: 'query',
          description: 'Results to skip',
          required: false,
          type: 'integer',
          format: 'int32'
        }
      }
    };

    api.resolve(spec, dummyUrl, function (spec) {
      var params = spec.paths['/pet'].post.parameters;
      expect(params.length).toBe(1);
      var param = params[0];
      expect(param.name).toBe('skip');
      done();
    });
  });

  it('doesn\'t puke on a malformed remote defined parameter $ref', function (done) {

    httpMock().allowNoRequest();

    var api = new Resolver();
    var spec = {
      paths: {
        '/pet': {
          post: {
            parameters: [{
              $ref: dummyUrl+'#/parameters/sharedSkipz'
            }]
          }
        }
      },
      parameters: {
        sharedSkip: {
          name: 'skip',
          in: 'query',
          description: 'Results to skip',
          required: false,
          type: 'integer',
          format: 'int32'
        }
      }
    };

    api.resolve(spec, dummyUrl, function (spec, unresolved) {
      expect(unresolved[dummyUrl+'#/parameters/sharedSkipz']).toEqual({
        root: dummyUrl,
        location: '/parameters/sharedSkipz'
      });
      done();
    });
  });

  it('resolves path references', function(done) {

    httpMock().respondJson(petstoreJson, 3);

    var api = new Resolver();
    var spec = {
      paths: {
        '/myUsername': {
          $ref: dummyUrl+'#paths/user~1{username}'
        }
      }
    };

    // TODO: remove dummy url from root
    api.resolve(spec,anotherDummyUrl, function (spec) {
      var path = spec.paths['/myUsername'];
      test.object(path);
      test.object(path.get);
      test.object(path.put);
      test.object(path.delete);
      done();
    });
  });

  it('resolves path references 2', function(done) {
    var api = new Resolver();

    var remoteSpec = require('./spec/v2/resourceWithLinkedDefinitions_part1.json');
    var remoteUrl = 'http://example.com/remote';
    httpMock().respondJson(remoteUrl, remoteSpec);

    var spec = {
      paths: {
        '/myUsername': {
          $ref: remoteUrl
        }
      }
    };

    // TODO: reduce number of requests (currently on 13)
    api.resolve(spec, function (spec) {
      var path = spec.paths['/myUsername'];
      test.object(path);
      test.object(path.get);
      done();
    });
  });

  it('resolves nested operations with referenced models', function(done) {

    var anotherRemoteUrl = 'http://localhost:8000/v2/models.json';
    var remoteUrl = 'http://example.com/remote';
    httpMock().respondJson(remoteUrl, require('./spec/v2/operations.json'));
    httpMock().respondJson(anotherRemoteUrl, require('./spec/v2/models.json'))

    var api = new Resolver();
    var spec = {
      paths: {
        '/health': {
          $ref: remoteUrl+'#health'
        }
      }
    };

    api.resolve(spec, 'http://localhost:8000/v2/petstore.json', function (spec) {
      var health = spec.paths['/health'].get;
      test.object(health);
      test.object(spec.definitions.Health);
      test.object(spec.definitions.JVMMemory);
      done();
    });
  });

  it.skip('should handle response references (swagger-ui/issues/1078)', function (done) {
    var api = new Resolver();
    var spec = {
      paths: {
        '/myUsername': {
          get: {
            responses: {
              '400': {
                $ref: 'http://localhost:8000/v2/petstore.json#/responses/veryBad'
              }
            }
          }
        }
      }
    };
    api.resolve(spec, 'http://localhost:8000/v2/petstore.json', function (spec) {
      var get = spec.paths['/myUsername'].get;
      var response = get.responses['400'];
      expect(response.description).toBe('failed');
      done();
    });
  });

  it.skip('resolves relative references absolute to root', function(done) {
    var api = new Resolver();
    var spec = {
      host: 'http://petstore.swagger.io',
      basePath: '/v2',
      paths: {
        '/health': {
          get: {
            parameters: [],
            responses: {
              default: { description: 'ok' }
            }
          }
        }
      },
      definitions: {
        Pet: {
          properties: {
            id: { $ref: '/v2/petstore.json#/definitions/Pet' }
          }
        }
      }
    };

    // should look in http://localhost:8000/v2/petstore.json#/definitions/Category
    api.resolve(spec, 'http://localhost:8000/foo/bar/swagger.json', function (spec) {
      var health = spec.paths['/health'];
      test.object(health);
      done();
    });
  });

  it.skip('resolves relative references relative to reference', function(done) {
    var api = new Resolver();
    var spec = {
      host: 'http://petstore.swagger.io',
      basePath: '/v2',
      paths: {
        '/health': {
          get: {
            parameters: [],
            responses: {
              default: { description: 'ok' }
            }
          }
        }
      },
      definitions: {
        Pet: {
          properties: {
            id: { $ref: 'Category' }
          }
        }
      }
    };

    // should look in http://localhost:8000/v2/petstore.json#/definitions/Category
    api.resolve(spec, 'http://localhost:8000/foo/bar/swagger.json', function (spec) {
      var health = spec.paths['/health'];
      test.object(health);
      done();
    });
  });

  it.skip('resolves relative references relative to reference 2', function(done) {
    var api = new Resolver();
    var spec = {
      host: 'http://petstore.swagger.io',
      basePath: '/v2',
      paths: {
        '/health': {
          get: {
            parameters: [],
            responses: {
              default: { description: 'ok' }
            }
          }
        }
      },
      definitions: {
        Pet: {
          properties: {
            id: { $ref: '../common/Address.json#/definitions/Pet' }
          }
        }
      }
    };

    // should look in http://localhost:8000/v2/petstore.json#/definitions/Category
    api.resolve(spec, 'http://localhost:8000/foo/bar/swagger.json', function (spec) {
      var health = spec.paths['/health'];
      test.object(health);
      done();
    });
  });

  it.skip('resolves relative references', function(done) {
    var api = new Resolver();
    var spec = {
      host: 'http://petstore.swagger.io',
      basePath: '/v2',
      paths: {
        '/health': {
          $ref: 'Category'
        }
      }
    };

    // should look in http://localhost:8000/foo/bar/swagger.json#/paths/health
    api.resolve(spec, 'http://localhost:8000/foo/bar/swagger.json', function (spec, unresolved) {
      expect(unresolved.Category).toEqual({
        root: 'http://localhost:8000/foo/bar/swagger.json',
        location: '/paths/health'
      });
      var health = spec.paths['/health'];
      test.object(health);
      done();
    });
  });

  it.skip('resolves a remote response object $ref without root', function (done) {
    var api = new Resolver();
    var spec = {
      paths: {
        '/pet': {
          post: {
            responses: {
              200: {
                $ref: '#/responses/200'
              }
            }
          }
        }
      },
      responses: {
        '200': {
          description: 'successful operation',
          schema: {
            $ref: '#/definitions/Pet'
          }
        }
      },
      definitions: {
        Pet: {
          properties: {
            type: 'integer',
            format: 'int32'
          }
        }
      }
    };

    api.resolve(spec, function (spec) {
      expect(spec.definitions.Pet).toExist();
      expect(spec.paths['/pet'].post.responses['200'].schema.$ref).toBe('#/definitions/Pet');

      done();
    });
  });

  it.skip('resolves relative references from a peer file', function(done) {
    var api = new Resolver();
    var spec = {
      host: 'http://petstore.swagger.io',
      basePath: '/v2',
      paths: {
        '/health': {
          $ref: 'definitions.yaml#/MyResource'
        }
      }
    };

    // should look in http://localhost:8000/foo/bar/swagger.json#/paths/health
    api.resolve(spec, 'http://localhost:8000/foo/bar/swagger.json', function (spec, unresolved) {
      expect(unresolved['definitions.yaml#/MyResource']).toEqual({
        root: 'http://localhost:8000/foo/bar/definitions.yaml',
        location: '/MyResource'
      });
      done();
    });
  });

  it.skip('resolves relative references from a sub-folder/file', function(done) {
    var api = new Resolver();
    var spec = {
      host: 'http://petstore.swagger.io',
      basePath: '/v2',
      paths: {
        '/health': {
          $ref: '/specific-domain/definitions.yaml#/MyResource'
        }
      }
    };

    // should look in http://localhost:8000/foo/bar/swagger.json#/paths/health
    api.resolve(spec, 'http://localhost:8000/foo/bar/swagger.json', function (spec, unresolved) {
      expect(unresolved['/specific-domain/definitions.yaml#/MyResource']).toEqual({
        root: 'http://localhost:8000/specific-domain/definitions.yaml',
        location: '/MyResource'
      });
      done();
    });
  });

  it.skip('resolves relative references from a parent folder/file', function(done) {
    var api = new Resolver();
    var spec = {
      host: 'http://petstore.swagger.io',
      basePath: '/v2',
      paths: {
        '/health': {
          $ref: '../json/definitions.json#/ApiError'
        }
      }
    };

    // should look in http://localhost:8000/foo/bar/swagger.json#/paths/health
    api.resolve(spec, 'http://localhost:8000/common/bar/swagger.json', function (spec, unresolved) {
      expect(Object.keys(unresolved).length).toBe(2);
      test.object(spec.paths['/health'].get);
      done();
    });
  });

  it.skip('resolves relative references from a yaml folder/file', function(done) {
    var api = new Resolver();
    var spec = {
      host: 'http://petstore.swagger.io',
      basePath: '/v2',
      paths: {
        '/health': {
          $ref: '../yaml/definitions.yaml#/ApiError'
        }
      }
    };

    // should look in http://localhost:8000/foo/bar/swagger.yaml#/paths/health
    api.resolve(spec, 'http://localhost:8000/common/bar/swagger.json', function (spec, unresolved) {
      expect(Object.keys(unresolved).length).toBe(0);
      test.object(spec.paths['/health'].get);
      done();
    });
  });

  it.skip('resolves multiple path refs', function(done) {
    var api = new Resolver();
    var spec = {
      host: 'http://petstore.swagger.io',
      basePath: '/v2',
      paths: {
        '/health': {
          $ref: 'http://localhost:8000/v2/operations.json#/health'
        },
        '/users': {
          get: {
            tags: [
              'users'
            ],
            summary: 'Returns users in the system',
            operationId: 'getUsers',
            produces: [
              'application/json'
            ],
            parameters: [
              {
                $ref: 'http://localhost:8000/v2/parameters.json#/query/skip'
              },
              {
                $ref: 'http://localhost:8000/v2/parameters.json#/query/limit'
              }
            ],
            responses: {
              200: {
                description: 'Users in the system',
                schema: {
                  type: 'array',
                  items: {
                    $ref: 'http://localhost:8000/v2/models.json#/Health'
                  }
                }
              },
              404: {
                $ref: 'http://localhost:8000/v2/responses.json#/NotFoundError'
              }
            }
          }
        }
      }
    };

    // should look in http://localhost:8000/foo/bar/swagger.yaml#/paths/health
    api.resolve(spec, 'http://localhost:8000/swagger.json', function (spec, unresolved) {
      expect(spec.paths['/users'].get.parameters.length).toBe(2);
      expect(Object.keys(unresolved).length).toBe(0);
      test.object(spec.paths['/health'].get);
      done();
    });
  });
});
