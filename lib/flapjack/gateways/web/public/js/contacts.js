$(document).ready(function() {

  var app = {
    api_url: $('div#data-api-url').data('api-url')
  };

  _.templateSettings = {
      interpolate: /<@=(.+?)@>/g,
      escape: /<@-(.+?)@>/g,
      evaluate: /<@(.+?)@>/g
  };

  app.Entity = Backbone.JSONAPIModel.extend({
    name: 'entities',
    defaults: {
      name: '',
      id: null
    },
    toJSON: function() {
      // hack to get saving working properly, should probably be done with a
      // collection and calling toJSON on that.
      return {'entities' : [_.pick(this.attributes, 'id', 'name')]};
    },
    urlRoot: function() { return app.api_url + "/entities"; }
  });

  app.EntityCollection = Backbone.JSONAPICollection.extend({
    model:      app.Entity,
    comparator: 'name',
    url: function() { return app.api_url + "/entities"; }
  });

  app.Medium = Backbone.JSONAPIModel.extend({
    name: 'media',
    defaults: {
      type: '',
      address: '',
      interval: '',
      rollup_threshold: '',
      id: null,
    },
    toJSON: function() {
      // hack to get saving working properly, should probably be done with a
      // collection and calling toJSON on that.
      return {'media' : [_.pick(this.attributes, 'id', 'type', 'address', 'interval', 'rollup_threshold')]};
    },
    urlRoot: function() { return(app.api_url + "/media"); },

    validate: function(attrs, options) {

      if ( _.isUndefined(attrs['type']) || _.isNull(attrs['type']) ||
           (_.isString(attrs['type']) && (attrs['type'].length == 0)) ) {
        return "medium type cannot be empty"
      }

      if ( _.isUndefined(attrs['address']) || _.isNull(attrs['address']) ||
           (_.isString(attrs['address']) && (attrs['address'].length == 0)) ) {
        return "medium address cannot be empty"
      }

      if ( _.isUndefined(attrs['interval']) || _.isNull(attrs['interval']) ||
           (_.isString(attrs['interval']) && (attrs['interval'].length == 0)) ) {
        return "medium interval cannot be empty"
      }

      if ( _.isUndefined(attrs['rollup_threshold']) || _.isNull(attrs['rollup_threshold']) ||
           (_.isString(attrs['rollup_threshold']) && (attrs['rollup_threshold'].length == 0)) ) {
        return "medium rollup threshold cannot be empty"
      }

    },

    sync: function(method, model, options) {
      if ( method == 'create') {
        options.url = app.api_url + '/contacts/' + model.contact.get('id') + '/media';
      } else {
        options.url = model.urlRoot.call() + '/' + model.get('id');
      }
      Backbone.JSONAPIModel.prototype.sync(method, model, options);
    }

  });

  app.MediumCollection = Backbone.JSONAPICollection.extend({
    model:      app.Medium,
    comparator: 'type',
    url: function() { return app.api_url + "/media"; }
  });

  app.Contact = Backbone.JSONAPIModel.extend({
    name: 'contacts',
    defaults: {
      first_name: '',
      last_name: '',
      email: '',
      id: null
    },
    validate: function(attrs, options) {

      if ( _.isUndefined(attrs['first_name']) || _.isNull(attrs['first_name']) ||
           (_.isString(attrs['first_name']) && (attrs['first_name'].length == 0)) ) {
        return "contact first name cannot be empty"
      }

      if ( _.isUndefined(attrs['last_name']) || _.isNull(attrs['last_name']) ||
           (_.isString(attrs['last_name']) && (attrs['last_name'].length == 0)) ) {
        return "contact last name cannot be empty"
      }

    },
    toJSON: function() {
      // hack to get saving working properly, should probably be done with a
      // collection and calling toJSON on that.
      return {'contacts' : [_.pick(this.attributes, 'id', 'first_name', 'last_name', 'email')]};
    },
    urlRoot: function() { return app.api_url + "/contacts"; },
    sync: function(method, model, options) {
      if ( method == 'create') {
        model.set('id', toolbox.generateUUID());
        options.url = model.urlRoot.call();
      } else {
        options.url = model.urlRoot.call() + '/' + model.get('id');
      }
      Backbone.JSONAPIModel.prototype.sync(method, model, options);
    }
  });

  app.ContactCollection = Backbone.JSONAPICollection.extend({
    model: app.Contact,
    url: function() { return app.api_url + "/contacts"; }
  });

  app.ActionsView = Backbone.View.extend({
    tagName: 'div',
    className: 'actions',
    template: _.template($('#contact-actions-template').html()),
    events: {
      "click button#addContact" : 'addContact'
    },
    addContact: function() {
      // skip if modal showing
      if ( $('#contactModal').hasClass('in') ) { return; }

      $('#contactModal h4#contactModalLabel').text('New Contact');
      $('#contactModal button#contactAccept').text('Create Contact');

      var context = this;

      this.model = new app.Contact();
      this.model.set('linked', {entities: new app.EntityCollection(), media: new app.MediumCollection()});

      var contactView = new app.ContactView({model: this.model});

      $('#contactModal div.modal-footer').siblings().remove();
      $('#contactModal div.modal-footer').before(contactView.render().$el);

      var currentEntities = this.model.get('linked')['entities'];

      var contactEntityList = new app.ContactEntityList({collection: currentEntities, contact: this.model});
      $('#contactModal tbody#contactEntityList').replaceWith( contactEntityList.render().$el );

      var entityChooser = new app.EntityChooser({model: this.model, currentEntities: currentEntities});
      entityChooser.render();

      var context = this;

      var mediaList = this.model.get('linked')['media'];

      // Setup contact media
      var contactMediaList = new app.ContactMediaList({
        collection: mediaList,
        contact: this.model
      });

      $('#contactModal tbody#contactMediaList')
        .replaceWith( contactMediaList.render().$el )

      // TODO if validating or leaving modal open, re-establish the event
      $('#contactModal button#contactAccept').click(function(event) {

        $(event.target).prop('disabled', true);

        if ( context.model.isValid() && mediaList.all( function(medium) {

          var allEmpty =
          ( _.isUndefined(medium.get('address')) || _.isNull(medium.get('address')) ||
           (_.isString(medium.get('address')) && (medium.get('address').length == 0)) ) &&
          ( _.isUndefined(medium.get('interval')) || _.isNull(medium.get('interval')) ||
           (_.isString(medium.get('interval')) && (medium.get('interval').length == 0)) ) &&
          ( _.isUndefined(medium.get('rollup_threshold')) || _.isNull(medium.get('rollup_threshold')) ||
           (_.isString(medium.get('rollup_threshold')) && (medium.get('rollup_threshold').length == 0)) );

          return(allEmpty || medium.isValid());
        }) ) {

          var result = context.model.save(context.model.attributes, {type: 'POST', contentType: 'application/json'});

          if ( result == false ) {
            $(event.target).prop('disabled', false);
          } else {
            mediaList.each(function(medium) {
              if ( medium.isValid() ) {
                var r = medium.save(medium.attributes, {type: 'POST', contentType: 'application/json'});
                if ( r != false) {
                  medium.set('id', context.model.get('id') + '_' + medium.get('type'));
                }
              }
            });
            contacts.add(context.model);

            $('#contactModal').modal('hide');
            $(event.target).prop('disabled', false);
          }
        } else {
          $(event.target).prop('disabled', false);
        }

      });

      $('#contactModal').modal('show');
    },
    render: function() {
      this.$el.html(this.template({}));
      return this;
    }
  });

  // this.model      == current contact
  // this.collection == duplicate of entities with
  //     entities enabled for this contact removed
  app.EntityChooser = Backbone.View.extend({
    template: _.template($('#contact-entity-chooser').html()),
    el: $("#entityAdd"),
    events: {
      'click button#add-contact-entity' : 'addEntities',
    },
    initialize: function(options) {
      this.options = options || {};
      this.listenTo(options.currentEntities, 'add',    this.refresh);
      this.listenTo(options.currentEntities, 'remove', this.refresh);
    },
    render: function() {

      this.calculate();

      // clear array
      this.entityIdsToAdd = new Array();

      this.$el.html(this.template({}));

      var jqel = $(this.el).find('input#entityChooser');

      var context = this;
      jqel.on('change', function(e) {
        if ( !_.isArray(e.removed) && _.isObject(e.removed) ) {
          context.entityIdsToAdd = _.without(context.entityIdsToAdd, e.removed.id);
        }

        if (  !_.isArray(e.added) && _.isObject(e.added) && (context.entityIdsToAdd.indexOf(e.added.id) == -1) ) {
          context.entityIdsToAdd.push(e.added.id);
        }
      });

      var format = function(item) { return item.name; }
      var context = this;

      jqel.select2({
        placeholder: "Select Entities",
        data: {results: context.results, text: 'name'},
        formatSelection: format,
        formatResult: format,
        multiple: true,
        width: 'off',
      });

      return this;
    },
    calculate: function() {
      var contact_entity_ids = this.options.currentEntities.pluck('id');

      var someEntities = allEntities.reject(function(item, context) {
        var id = item.get('id');
        return _.isUndefined(id) || _.isNull(id) || _.contains(contact_entity_ids, id);
      });

      this.collection = new app.EntityCollection(someEntities);

      this.results = this.collection.map( function(item) {
        return item.attributes;
      });
    },
    refresh: function(model, collection, options) {
      this.calculate();
      var jqel = $(this.el).find('input#entityChooser');
      var context = this;
      var format = function(item) { return item.name; }
      jqel.select2({
        placeholder: "Select Entities",
        data: {results: context.results, text: 'name'},
        formatSelection: format,
        formatResult: format,
        multiple: true,
        width: 'off',
      });
    },
    addEntities: function() {
      var jqel = $(this.el).find('input#entityChooser');
      jqel.select2("val", null);
      var context = this;
      _.each(this.entityIdsToAdd, function(entity_id) {
        var newEntity = allEntities.find(function(entity) { return entity.id == entity_id; });
        context.model.addLinked('contacts', 'entities', newEntity);
      });
      this.entityIdsToAdd.length = 0;
    },
  });

  app.ContactView = Backbone.View.extend({
    template: _.template($('#contact-template').html()),
    id: 'contactView',
    events: {
      'change input[name="contact_first_name"]' : 'contactChanged',
      'change input[name="contact_last_name"]' : 'contactChanged'
    },
    render: function() {
      var template_values = _.clone(this.model.attributes);
      this.$el.html(this.template(template_values));
      return this;
    },
    contactChanged: function(event) {


      if ( $(event.target).attr('name') == 'contact_first_name' ) {
        this.model.set('first_name', $(event.target).val());
      }

      if ( $(event.target).attr('name') == 'contact_last_name' ) {
        this.model.set('last_name', $(event.target).val());
      }

    },
  });

  app.ContactList = Backbone.View.extend({
    tagName: 'tbody',
    el: $('#contactList'),
    initialize: function() {
      this.collection.on('add', this.render, this);
    },
    render: function() {
      var jqel = $(this.el);
      jqel.empty();
      var context = this;
      this.collection.each(function(contact) {
        var item = new app.ContactListItem({ model: contact });
        jqel.append($(item.render().el));
      });

      return this;
    },
  });

  app.ContactEntityList = Backbone.View.extend({
    tagName: 'tbody',
    id: 'contactEntityList',
    initialize: function(options) {
      this.options = options || {};
      this.collection.on('add', this.render, this);
      this.collection.on('remove', this.render, this);
    },
    render: function() {
      var jqel = $(this.el);
      jqel.empty();
      var contact = this.options.contact;
      this.collection.each(function(entity) {
         var item = new app.ContactEntityListItem({ model: entity, contact: contact });
         jqel.append(item.render().el);
      });

      return this;
    },
  });

  app.ContactEntityListItem = Backbone.View.extend({
    tagName: 'tr',
    template: _.template($('#contact-entities-list-item-template').html()),
    events: {
      'click button.delete-entity' : 'removeEntity',
    },
    initialize: function(options) {
      this.options = options || {};
    },
    render: function() {
      var template_values = _.clone(this.model.attributes);
      this.$el.html(this.template(template_values));
      return this;
    },
    removeEntity: function() {
      this.options.contact.removeLinked('contacts', 'entities', this.model);
      this.$el.remove();
    },
  });

  app.ContactListItem = Backbone.View.extend({
    tagName: 'tr',
    className: 'contact_list_item',
    template: _.template($('#contact-list-item-template').html()),
    events: {
      'change input[name="contact_first_name"]' : 'contactChanged',
      'change input[name="contact_last_name"]' : 'contactChanged',
      'click .button.delete-contact': 'removeContact',
      'click':                        'editContact',
    },
    initialize: function() {
      // causes an unnecessary render on create, but required for update TODO cleanup
      this.listenTo(this.model, "sync", this.render);
    },

    render: function() {
      var template_values = _.clone(this.model.attributes);
      this.$el.html(this.template(template_values));
      return this;
    },

    contactChanged: function(event) {

      if ( $(event.target).attr('name') == 'contact_first_name' ) {
        this.model.set('first_name', $(event.target).val());
      }

      if ( $(event.target).attr('name') == 'contact_last_name' ) {
        this.model.set('last_name', $(event.target).val());
      }

    },

    editContact: function() {
      // skip if modal showing
      if ( $('#contactModal').hasClass('in') ) { return; }

      $('#contactModal h4#contactModalLabel').text('Edit Contact');
      $('#contactModal button#contactAccept').text('Update Contact');

      var context = this;

      var contactView = new app.ContactView({model: this.model});

      $('#contactModal div.modal-footer').siblings().remove();
      $('#contactModal div.modal-footer').before(contactView.render().$el);

      var currentEntities = this.model.get('linked')['entities'];

      var contactEntityList = new app.ContactEntityList({collection: currentEntities, contact: this.model});
      $('#contactModal tbody#contactEntityList').replaceWith( contactEntityList.render().$el );

      var entityChooser = new app.EntityChooser({model: this.model, currentEntities: currentEntities});
      entityChooser.render();

      var mediaList = this.model.get('linked')['media'];

      // Setup contact media
      var contactMediaList = new app.ContactMediaList({
        collection: this.model.get('linked')['media'],
        contact: this.model
      });

      $('#contactModal tbody#contactMediaList')
        .replaceWith( contactMediaList.render().$el )

      // TODO if validating or leaving modal open, re-establish the event
      $('#contactModal button#contactAccept').click(function(event) {

        $(event.target).prop('disabled', true);

        // TODO mediaList not defined here, replace with current
        if ( context.model.isValid() && mediaList.all( function(medium) {

          var allEmpty =
          ( _.isUndefined(medium.get('address')) || _.isNull(medium.get('address')) ||
           (_.isString(medium.get('address')) && (medium.get('address').length == 0)) ) &&
          ( _.isUndefined(medium.get('interval')) || _.isNull(medium.get('interval')) ||
           (_.isString(medium.get('interval')) && (medium.get('interval').length == 0)) ) &&
          ( _.isUndefined(medium.get('rollup_threshold')) || _.isNull(medium.get('rollup_threshold')) ||
           (_.isString(medium.get('rollup_threshold')) && (medium.get('rollup_threshold').length == 0)) );

          return(allEmpty || medium.isValid());
        }) ) {

          var result = context.model.patch('contacts', context.model.attributes);

          if ( result == false ) {
            $(event.target).prop('disabled', false);
          } else {
            mediaList.each(function(medium) {
              if ( medium.isValid() ) {
                var r = medium.patch('media', medium.attributes);
                if ( r != false) {
                  medium.set('id', context.model.get('id') + '_' + medium.get('type'));
                }
              }
            });

            $('#contactModal').modal('hide');
            $(event.target).prop('disabled', false);
          }
        } else {
          $(event.target).prop('disabled', false);
        }

      });

      $('#contactModal').modal('show');
    },

    removeContact: function(e) {
      e.stopImmediatePropagation();

      var context = this;

      context.model.destroy({
        success: function() {
          context.remove()
        }
      });
    },
  });

  app.ContactMediaList = Backbone.View.extend({
    tagName: 'tbody',
    id: 'contactMediaList',
    initialize: function(options) {
      var context = this;
      _.each(['email', 'sms', 'jabber'], function(type) {
        var medium = context.collection.find(function(cm) {
          return cm.get('type') == type;
        });

        if ( _.isUndefined(medium) ) {
          medium = new app.Medium({
            type: type,
            address: '',
            interval: '',
            rollup_threshold: '',
          });
          medium.contact = options.contact;
          context.collection.add(medium);
        }
      });
    },
    render: function() {
      var jqel = $(this.el);
      jqel.empty();

      this.collection.each(function(medium) {
        var item = new app.ContactMediaListItem({ model: medium });
        jqel.append(item.render().el);
      });

      return this;
    },

  });

  app.ContactMediaListItem = Backbone.View.extend({
    tagName: 'tr',
    template: _.template($('#contact-media-list-item-template').html()),
    events: {
      // scoped to this view's el
      'change input' : 'mediumChanged'
    },
    render: function() {
      var template_values = _.clone(this.model.attributes);
      template_values['labels'] = {
        'email'  : 'Email',
        'sms'    : 'SMS',
        'jabber' : 'Jabber'
      };
      this.$el.html(this.template(template_values));
      return this;
    },

    mediumChanged: function(event) {
      this.model.set(event.target.getAttribute('data-attr'), event.target.value);
    }

  });

  var allEntities = new app.EntityCollection();
  var contacts = new app.ContactCollection();

  allEntities.fetch({
    success: function(collection, response, options) {
      contacts.fetch({
        success: function(collection, response, options) {
          collection.resolveLinks({'media' : app.MediumCollection});
          collection.resolveLinks({'entities' : app.EntityCollection});
          var actionsView = new app.ActionsView({collection: collection});
          var contactList = new app.ContactList({collection: collection});
          $('#container').append(actionsView.render().el);
          contactList.render();
        }
      });
    }
  });

});
