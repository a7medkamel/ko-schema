define([
    'sinon'
  , 'should'
  , 'lib/squire'
  , 'lib/underscore'
], function(sinon, should, Squire, _) {
  'use strict';

  describe('ko-schema', function() {

    var ko_schema   = undefined
      , config      = {
          get : function(key){
            switch(key) {
              case 'culture':
                return 'en-us';
              case 'debug':
                return true;
              case 'globalization.number.decimalpoint':
                return '.';
            }
          }
        }
      , schema      = {
          'title': 'Cat Schema',
          'type': 'object',
          'properties': {
            'index': {
              'type': 'integer'
            },
            'name': {
              'type': 'string',
              'maxLength' : 5
            },
            'breed': {
              'type': 'string',
              'required': true
            },
            'weight': {
              'type': 'number'
            },
            'age': {
              'description': 'Age in years',
              'type': 'integer',
              'minimum': 0,
              'maximum': 50
            }
          },
          'required': ['index', 'name']
        }
      , schema_i18n   = {
          property : function() {
            return '';
          }
      }
      ;

    before(function (done) {
      var injector = new Squire();

      injector
        .mock({
            'component/config/index'                        : config
          , 'data/i18n/component/ko-validation/en-us'       : {}
          , 'data/i18n/component/ko-schema/en-us'           : {}
          , 'data/i18n/component/api-errors-campaign/en-us' : {}
          , 'component/schema-i18n/index'                   : schema_i18n
        })
        .require(['component/ko-schema/index'], function(module){
          ko_schema = module;

          done();
        })
        ;
    });

    after(function() {
    });

    describe('string', function() {

      beforeEach(function() {
      });

      it('required should be read from property info', function() {
        var ko_model = { };

        ko_schema.properties(ko_model, schema, ['breed']);

        ko_model.breed('');

        ko_model.breed.errors().should.be.instanceof(Array).and.have.lengthOf(1);
        ko_model.breed.errors()[0].should.be.equal('[VALIDATION_NOTEMPTY_REQUIRED_FIELD]');
      });

      it('required should be read from outside properties', function() {
        var ko_model = { };

        ko_schema.properties(ko_model, schema, ['name']);

        ko_model.name('');

        ko_model.name.errors().should.be.instanceof(Array).and.have.lengthOf(1);
        ko_model.name.errors()[0].should.be.equal('[VALIDATION_NOTEMPTY_REQUIRED_FIELD]');
      });

      it('maxLength should be read from property info', function() {
        var ko_model = { };

        ko_schema.properties(ko_model, schema, ['name']);

        ko_model.name('12345-cat');

        _.isEmpty(ko_model.name()).should.be.true;
      });

      it('minimum should be read from property info', function() {
        var ko_model = { };

        ko_schema.properties(ko_model, schema, ['age']);

        ko_model.age(-1);

        ko_model.age.errors().should.be.instanceof(Array).and.have.lengthOf(1);
        ko_model.age.errors()[0].should.be.equal('[VALIDATION_NUMBER_RANGE_BETWEEN]');
      });

      it('maximum should be read from property info', function() {
        var ko_model = { };

        ko_schema.properties(ko_model, schema, ['age']);

        ko_model.age(60);

        ko_model.age.errors().should.be.instanceof(Array).and.have.lengthOf(1);
        ko_model.age.errors()[0].should.be.equal('[VALIDATION_NUMBER_RANGE_BETWEEN]');
      });

      it('should not allow decimal on integer types', function() {
        var ko_model = { };

        ko_schema.properties(ko_model, schema, ['age']);

        ko_model.age(15.03);

        _.isEmpty(ko_model.age()).should.be.true;
      });

      it('should allow decimal on decimal types', function() {
        var ko_model = { };

        ko_schema.properties(ko_model, schema, ['weight']);

        ko_model.weight(15.03);

        ko_model.weight.errors().should.be.instanceof(Array).and.have.lengthOf(0);
        ko_model.weight().should.be.equal(15.03);
      });
    });

    describe('custom validators', function() {
      beforeEach(function() {
      });

      it('should allow custom validator to be passed in', function() {
        var ko_model = { };
        var model = null;
        var errorMessage = 'minors are not allowed!';
        var customValidators = {
          'age': {
            isValid: function(value) {
              return value > 18;
            },
            'message': errorMessage
          }
        };

        ko_schema.properties(ko_model, schema, ['name', 'weight', 'age'], model, customValidators);
        ko_model.age(12);
        ko_model.age.errors().should.be.instanceof(Array).and.have.lengthOf(1);
        ko_model.age.errors()[0].should.be.equal(errorMessage);
        ko_model.validate().should.be.false;
      });
    });

    describe('toObject', function() {
      beforeEach(function() {
      });

      it('should allow model null', function() {
        var ko_model = { };
        var model = null;

        ko_schema.properties(ko_model, schema, ['name', 'weight', 'age'], model);
        var result = ko_model.toObject();
        should.not.exist(result.weight);
        result.age.should.be.equal(0);
        result.name.should.be.equal('');
      });

      it('should allow part of model"s field null or empty', function() {
        var ko_model = { };
        var model = {
          age   : 1,
          name  : ''
        };

        ko_schema.properties(ko_model, schema, ['name', 'breed', 'weight', 'age'], model);
        var result = ko_model.toObject();
        should.not.exist(result.weight);
        result.age.should.be.equal(1);
        result.name.should.be.equal('');
        result.breed.should.be.equal('');
      });

      it('should return proper values', function() {
        var ko_model = { };
        var model = {
          name   : 'dog',
          weight : 15.03,
          age    : 1
        };

        ko_schema.properties(ko_model, schema, ['name', 'weight', 'age'], model);
        var result = ko_model.toObject();

        result.weight.should.be.equal(15.03);
        result.name.should.be.equal('dog');
        result.age.should.be.equal(1);
      });
    });

    describe('charactersRemaining', function() {
      beforeEach(function() {
      });

      it('should return remaining characters', function() {
        var ko_model = { };

        ko_schema.properties(ko_model, schema, ['name']);
        ko_model.name.char_rem().should.be.equal('[REMAININGCHARACTERSTEXT_NEW]');
      });
    });

    describe('validate', function() {
      beforeEach(function() {
      });

      it('should return remaining characters', function() {
        var ko_model = { };

        ko_schema.properties(ko_model, schema, ['name']);
        ko_model.validate().should.be.false;
      });
    });

    describe('hasChange', function() {
      beforeEach(function() {
      });

      it('should return false if there isn"t any change to ko_model', function() {
        var ko_model = {};
        var model = {
          name   : 'dog',
          weight : 15.03,
          age    : 1
        };

        ko_schema.properties(ko_model, schema, ['name', 'weight', 'age'], model);
        ko_model.hasChange().should.be.false;
      });

      it('should return true if made changes to ko_model', function() {
        var ko_model = {};
        var model = {
          name   : 'dog',
          weight : 15.03,
          age    : 1
        };

        ko_schema.properties(ko_model, schema, ['name', 'weight', 'age'], model);
        ko_model.name('cat');
        ko_model.hasChange().should.be.true;
      });
    });

    describe('error handling', function() {
      beforeEach(function() {
      });

      it('should set error message to ko_model.errors when Property is null', function() {
        var ko_model = {};
        ko_schema.properties(ko_model, schema, ['name']);
        ko_model.errors.add({
          errors: [{
            Code     : 'odataErrorCode',
            Message  : '',
            Property : null
          }]
        });

        ko_model.errors().should.be.instanceof(Array).and.have.lengthOf(1);
        ko_model.errors()[0].should.be.equal('[ERROR_CAMPAIGN_API_ODATAERRORCODE]');
      });

      it('should set error message to property"s errors when property isn"t null', function() {
        var ko_model = {};
        ko_schema.properties(ko_model, schema, ['name']);
        ko_model.errors.add({
          errors: [{
            Code     : 'odataErrorCode',
            Message  : '',
            Property : 'name'
          }]
        });
        ko_model.name.errors()[0].should.be.equal('[ERROR_CAMPAIGN_API_ODATAERRORCODE]');
        ko_model.name.errors()[0].source.should.be.equal('api');
      });

      it('should set general error message when response.errors doesn"t exist', function() {
        var ko_model = {};
        ko_schema.properties(ko_model, schema, ['name']);
        ko_model.errors.add({});
        ko_model.errors()[0].should.be.equal('[GENERICERRORMESSAGE]');
      });

      it('should reset errors when calling ko_model.errors.clear()', function() {
        var ko_model = {};
        ko_schema.properties(ko_model, schema, ['name']);
        ko_model.errors.add({
          errors: [{
            Code     : 'odataErrorCode',
            Message  : '',
            Property : 'name'
          },
          {
            Code     : 'odataErrorCode_1',
            Message  : '',
            Property : ''
          }]
        });

        ko_model.errors.clear();
        ko_model.errors().should.be.instanceof(Array).and.have.lengthOf(0);
        ko_model.name.errors().should.be.instanceof(Array).and.have.lengthOf(0);
      });
    });
  });

});