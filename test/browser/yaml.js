'use strict';
var expect = require('chai').expect;
var Http = require('../../lib/http');
var client;
var sinon = require('sinon');
var $ = require('jquery');
var server;

describe('yaml', function () {

  before(function(){
    server = sinon.fakeServer.create();
  });

  after(function(){
    server.restore();
  });

  it('should parse yaml with jquery', function (done) {
    this.timeout(5 * 1000);
    var url = '/some.yaml';
    server.respondWith('GET', url, [
      200,
      {},
      'some: string'
    ])

    var http = new Http();
    http.execute({
      url: url,
      method: 'GET',
      useJQuery: true,
      body: {},
      on: {
        response: function (resp) {
          console.log('hello');
          expect(data).to.eql({})
          done();
        },
        error: function (err) {
          console.log('err', err);
          throw err.statusText;
        }
      }
    })

    server.respond();

  });

});
