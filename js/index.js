define([
    'lib/underscore'
  , 'lib/knockout'
  , '$/i18n!component/ko-schema'
  , 'component/schema-i18n/index'
  , 'component/ko-validation/index'
  , 'component/api-errors-campaign/index'
], function (_, ko, i18n, schema_i18n, ko_validation, i18nErrors) {
  'use strict';

  function numberRulesGenerator(prop, decimalLength) {
    // TODO: [zhbliu] [#1389542] support integer length and decimal length defined in schema
    var rules = [ko_validation.number.size(undefined, decimalLength)];

    if (_.isFinite(prop.maximum) || _.isFinite(prop.minimum)) {
      rules.push(ko_validation.number.range(prop.minimum, prop.maximum));
    }

    return rules;
  }

  var rulesGenerator = {
    integer: function(prop) {
      return numberRulesGenerator(prop, 0);
    },
    number: function(prop) {
      return numberRulesGenerator(prop, 2);
    },
    string: function(prop) {
      if (prop.enum) {
        return [ko_validation.enum(prop.enum, prop.nullable)];
      } else if (_.isFinite(prop.maxLength)) {
        if (_.isUndefined(prop.maxLengthValidate) || prop.maxLengthValidate) {
          return [ko_validation.string.size(prop.maxLength)];
        }
      }

      return [];
    },
    boolean: function(prop) {
      return [ko_validation.enum([true, false], prop.nullable)];
    },
    object: function() {
      return [];
    },
    array: function() {
      return [];
    },
    datetime: function() {
     return [];
    }
  };

  // TODO: [zhbliu] [#1389532] change to use js-data createInstance to create default values after js-data related works finish.
  var defaultValues = {
    integer: function(prop) {
      return _.isEmpty(prop.enum) ? 0 : _.first(prop.enum);
    },
    number: _.constant(),
    string: function(prop) {
      return _.isEmpty(prop.enum) ? '' : _.first(prop.enum);
    },
    boolean: _.constant(false),
    object: _.constant({}),
    array: _.constant([]),
    datetime: _.constant()
  };

  var typeSpecified = {
    integer: _.noop,
    number: _.noop,
    string: function(local, prop) {
      local.maxLength = ko.observable(prop.maxLength);
      local.char_rem = ko.computed(function() {
        if (!_.isFinite(prop.maxLength)) {
          return '';
        }
        var count = prop.maxLength - _.size(local());
        return count >= 0 ?  i18n.get('RemainingCharactersText_New', { count: count }) :
            i18n.get('ExceededCharactersText_New', { count: 0 - count });
      });
    },
    boolean: function(local, prop) {
      local.string = ko.computed({
        read: function() {
          var value = local();

          if (prop.nullable && _.isNull(value)) {
            return 'null';
          } else {
            return value.toString();
          }
        },
        write: function(value) {
          if (prop.nullable && 'null' === value) {
            local(null);
          } else {
            local(value === 'true');
          }
        }
      });
    },
    object: _.noop,
    array: _.noop,
    datetime: _.noop
  };

  // todo [akamel] allow custom validators to be passed in
  function get_observables(schema, names, model, customValidators) {
    var ret = {};

    var keys = _.intersection(_.keys(schema.properties), names);

    _.each(keys, function(key) {
      var prop  = schema.properties[key];
      var rules = rulesGenerator[prop.type](prop);
      var value = _.result(model, key, defaultValues[prop.type](prop));

      if (prop.required || _.contains(schema.required, key)) {
        rules.push(ko_validation.required());
      }

      if (_.isObject(customValidators) && _.isObject(customValidators[key])) {
        rules.push(ko_validation.custom(customValidators[key].isValid, customValidators[key].message));
      }

      if (prop.type === 'array') {
        ret[key] = ko.observableArray(value);
      } else {
        ret[key] = ko.observable(value);
      }

      ret[key] = ret[key].extend({ validate: rules });

      typeSpecified[prop.type](ret[key], prop);
    });

    return ret;
  }

  function aggregateStringLength(ret, schema) {
    if (_.isArray(schema.aggregateLength)) {
      _.each(schema.aggregateLength, function(aggregateLengthAttr) {
        var presentProperty = aggregateLengthAttr.presentProperty;
        var properties = _.chain(aggregateLengthAttr.properties)
                          .map(function(prop) {
                            return schema_i18n.property(schema.name, prop);
                          })
                          .join(' + ')
                          .value();

        ret[presentProperty].char_rem = ko.computed(function() {
          var sum = 0;
          _.each(aggregateLengthAttr.properties, function(property) {
            sum += _.size(ret[property]());
          });

          return i18n.get('RemainingCharactersText_Aggregate', {
            count: aggregateLengthAttr.maxLength - sum,
            properties: properties });
        });

        ret[presentProperty].maxLength = ko.computed(function() {
          var sum = 0;
          _.each(_.difference(aggregateLengthAttr.properties, [presentProperty]), function(property) {
            sum += _.size(ret[property]());
          });
          return aggregateLengthAttr.maxLength - sum;
        });

        _.each(_.difference(aggregateLengthAttr.properties, [presentProperty]), function(property) {
          ret[property].maxLength = ko.computed(function() {
            return ret[presentProperty].maxLength() - _.size(ret[presentProperty]()) + _.size(ret[property]());
          });
        });
      });
    }

    return ret;
  }

  function toObject(ko_model, keys) {
    return _.object(keys, _.map(keys, function(key) {
      return ko_model[key]();
    }));
  }

  function validate(ko_model, keys) {
    return _.chain(keys)
           .map(function(key) { return !_.isFunction(ko_model[key].validate) || ko_model[key].validate(); })
           .every()
           .value();
  }

  function addErrors(ko_model, response, adapter) {
    if (response && response.errors) {
      _.chain(response.errors)
       .groupBy('Property')
       .mapObject(function(errors) {
         return i18nErrors.get(errors, adapter);
       })
       .each(function(i18nErrors, property) {
         if (!_.isEmpty(property) && _.has(ko_model, property)) {
           var property_errors = _.map(i18nErrors, function (error) {
             var api_error = new String(error);
             api_error.source = 'api';
             return api_error;
           });
           ko_model[property].errors(property_errors);
         } else {
           ko.observableArray.fn.push.apply(ko_model.errors, i18nErrors);
         }
       });
    } else {
      ko_model.errors([i18n.get('GenericErrorMessage')]);
    }
  }

  function clearErrors(ko_model, keys) {
    ko_model.errors.removeAll();
    _.each(keys, function(key) {
      if (_.isFunction(ko_model[key].errors) && !_.isEmpty(ko_model[key].errors())) {
        ko_model[keys].errors.remove(function(error) {
          return error.source === 'api';
        });
      }
    });
  }

  function hasChange(ko_model, originalModel, keys) {
    var current = ko_model.toObject();
    var original = _.pick(originalModel, keys);
    return !_.isEqual(current, original);
  }

  function extendProperties(ko_model, schema, keys, model, customValidators) {
    if (!_.isEmpty(schema) && !_.isEmpty(keys)) {
      var ret = get_observables(schema, keys, model, customValidators);
      _.extend(ko_model, aggregateStringLength(ret, schema), {
        toObject  : _.partial(toObject, ko_model, keys),
        validate  : _.partial(validate, ko_model, keys),
        hasChange : _.partial(hasChange, ko_model, model, keys)
      });
    }

    ko_model.errors = ko.observableArray([]);
    _.extend(ko_model.errors, {
      add   : _.partial(addErrors, ko_model),
      clear : _.partial(clearErrors, ko_model, keys),
    });
  }

  function prototype(type, schema, keys, model, customValidators) {
    extendProperties(type.prototype, schema, keys, model, customValidators);
  }

  function properties(instance, schema, keys, model, customValidators) {
    extendProperties(instance, schema, keys, model, customValidators);
  }

  return {
      prototype   : prototype
    , properties  : properties
  };
});