'use strict';

const Homey = require('homey');
const https = require('https');

module.exports = class MyDevice extends Homey.Device {

  /**
   * onInit is called when the device is initialized.
   */
  async onInit() {
    this.log(this.getName() + ' has been initialized');
  }

  /**
   * onAdded is called when the user adds the device, called just after pairing.
   */
  async onAdded() {
    this.log(this.getName() + ' has been added');
  }

  /**
   * onSettings is called when the user updates the device's settings.
   * @param {object} event the onSettings event data
   * @param {object} event.oldSettings The old settings object
   * @param {object} event.newSettings The new settings object
   * @param {string[]} event.changedKeys An array of keys changed since the previous version
   * @returns {Promise<string|void>} return a custom message that will be displayed
   */
  async onSettings({ oldSettings, newSettings, changedKeys }) {
    this.log(this.getName() + ' settings where changed');
  }

  /**
   * onRenamed is called when the user updates the device's name.
   * This method can be used this to synchronise the name to the device.
   * @param {string} name The new name
   */
  async onRenamed(name) {
    this.log(name + 'was renamed');
  }

  /**
   * onDeleted is called when the user deleted the device.
   */
  async onDeleted() {
    const name = this.getName();
    this.log(name + ' has been deleted');

    //If the device's name in "unpair" than unpair it from the WebUserId
    if (name.toLowerCase() === 'unpair') {
      const webUserId = this.homey.settings.get('pimalink.webUserID');

      const response = await pimalinkApiPost(
        webUserId,
        '/api/WebUser/UnPair',
        this.getData().id
      );

      if (response.statusCode === 204) {
        this.log('successfully unpaired ' + this.getData().id + ' from the WebUserId');
      }
      else {
        this.log('Error unpairing ' + this.getData().id + '. \nError: ' + response.errorText);
      }
    }
  }


};

async function pimalinkApiPost(webUserId, path, data = {}) {
  return new Promise((resolve) => {
    try {
      const body = JSON.stringify({
        data,
        "header": {
          "oSType": "2",
          "webUserId": webUserId
        }
      });

      // Custom agent to skip TLS verification for application.pimalink.com only
      const agent = new https.Agent({
        checkServerIdentity: (host, cert) => {
          if (host === 'application.pimalink.com') return undefined;
          const { checkServerIdentity } = require('tls');
          return checkServerIdentity(host, cert);
        }
      });

      const options = {
        hostname: 'application.pimalink.com',
        port: 443,
        path,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body)
        },
        agent
      };

      const req = https.request(options, (res) => {
        let responseData = '';
        res.on('data', (chunk) => { responseData += chunk; });
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode,
            body: responseData
          });
        });
      });

      req.on('error', (err) => {
        console.log('HTTPS request error:', err);
        resolve({
          statusCode: null,
          body: null,
          error: err
        });
      });

      req.write(body);
      req.end();

    } catch (err) {
      console.log('Error in pimalinkApiPost:', err);
      resolve({
        statusCode: null,
        body: null,
        error: err
      });
    }
  });
}
