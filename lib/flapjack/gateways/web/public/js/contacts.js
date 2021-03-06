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
      return { entities: [ _.clone( this.attributes ) ] }
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
      address: '',
      interval: 60,
      rollup_threshold: 3,
      id: null,
      contact_id: null,
    },
    toJSON: function() {
      return { media: [ _.clone( this.attributes ) ] }
    },
    urlRoot: function() { return(app.api_url + "/media"); },

    sync: function(method, model, options) {
      if ( method == 'create') {
        options.url = app.api_url + '/contacts/' + model.get('contact_id') + '/media';
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
    toJSON: function() {
      return { contacts: [ _.clone( this.attributes ) ] }
    },
    urlRoot: function() { return app.api_url + "/contacts"; }
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
      "click button#addContact" : "addContact",
    },
    addContact: function() {
      // skip if modal showing
      if ( $('#contactModal').hasClass('in') ) { return; }

      $('#contactModal h4#contactModalLabel').text('New Contact');
      $('#contactModal button#contactAccept').text('Create Contact');

      var context = this;

      // TODO if validating or leaving modal open, re-establish the event
      $('#contactModal button#contactAccept').one('click', function() { context.save(); });

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

      // Setup contact media
      var contactMediaList = new app.ContactMediaList({
        collection: this.model.get('linked')['media'],
        contact: this.model
      });

      $('#contactModal tbody#contactMediaList')
        .replaceWith( contactMediaList.render().$el )

      $('#contactModal').modal('show');
    },
    render: function() {
      this.$el.html(this.template({}));
      return this;
    },
    save: function() {
      data = {'first_name': $('#contactModal input[name=contact_first_name]').val(),
              'last_name': $('#contactModal input[name=contact_last_name]').val(),
              'email': $('#contactModal input[name=contact_email]').val()};
      this.model.save(data, {type: 'POST', contentType: 'application/vnd.api+json'});
      contacts.add(this.model);
      $('#contactModal').modal('hide');
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
        return _.contains(contact_entity_ids, item.get('id'));
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
    render: function() {
      var template_values = _.clone(this.model.attributes);
      this.$el.html(this.template(template_values));
      return this;
    }
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

    editContact: function() {
      // skip if modal showing
      if ( $('#contactModal').hasClass('in') ) { return; }

      $('#contactModal h4#contactModalLabel').text('Edit Contact');
      $('#contactModal button#contactAccept').text('Update Contact');

      var context = this;

      // TODO if validating or leaving modal open, re-establish the event
      $('#contactModal button#contactAccept').one('click', function() { context.save(); });

      var contactView = new app.ContactView({model: this.model});

      $('#contactModal div.modal-footer').siblings().remove();
      $('#contactModal div.modal-footer').before(contactView.render().$el);

      var currentEntities = this.model.get('linked')['entities'];

      var contactEntityList = new app.ContactEntityList({collection: currentEntities, contact: this.model});
      $('#contactModal tbody#contactEntityList').replaceWith( contactEntityList.render().$el );

      var entityChooser = new app.EntityChooser({model: this.model, currentEntities: currentEntities});
      entityChooser.render();

      // Setup contact media
      var contactMediaList = new app.ContactMediaList({
        collection: this.model.get('linked')['media'],
        contact: this.model
      });

      $('#contactModal tbody#contactMediaList')
        .replaceWith( contactMediaList.render().$el )

      $('#contactModal').modal('show');
    },

    save: function() {
      data = {'first_name': $('#contactModal input[name=contact_first_name]').val(),
              'last_name': $('#contactModal input[name=contact_last_name]').val()};
      this.model.patch('contacts', data);
      $('#contactModal').modal('hide');
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
            interval: 15,
            rollup_threshold: 3,
            contact_id: options.contact.get('id')
          });
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
      'change input' : 'updateMedium'
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
    updateMedium: function(event) {
      var address =  $(event.target).parent('td')
                      .siblings().addBack().find('input[data-attr=address]');
      var interval = $(event.target).parent('td')
                      .siblings().addBack().find('input[data-attr=interval]');
      var rollupThreshold =
                     $(event.target).parent('td')
                      .siblings().addBack().find('input[data-attr=rollup_threshold]');

      var addressVal = address.val();
      var intervalVal = interval.val();
      var rollupThresholdVal = rollupThreshold.val();

      var numRE = /^[0-9]+$/;

      if ( !numRE.test(intervalVal) || !numRE.test(rollupThresholdVal) ) {
        // only save if numeric fields have acceptable values
        return;
      }

      if ( _.isUndefined(addressVal) || (addressVal.length == 0) ) {
        // only save if address not blank
        return;
      }

      // TODO visually highlight error

      var attrName = event.target.getAttribute('data-attr');
      var value = event.target.value;

      var attrs = {};
      attrs[attrName] = value;

      if ( this.model.isNew() ) {
        this.model.save(attrs);
        this.model.set('id', this.model.get('contact_id') + '_' + this.model.get('type'));
      } else {
        this.model.patch('media', attrs);
      }
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
