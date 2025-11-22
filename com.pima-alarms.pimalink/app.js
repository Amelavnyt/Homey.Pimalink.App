'use strict';

const Homey = require('homey');

const crypto = require("crypto")

module.exports = class MyApp extends Homey.App {

  /**
   * onInit is called when the app is initialized.
   */
  async onInit() {

    if(!this.homey.settings.get('pimalink.webUserID')) {
          this.homey.settings.set('pimalink.webUserID', generateWebUserId());
          this.log('New ID Generated');
    }

    this.log('webUserID: ' + this.homey.settings.get('pimalink.webUserID'));
    this.log('Pimalink app has been initialized');
  }


};

  function generateWebUserId() {
    return crypto.randomBytes(8).toString("hex");
  }