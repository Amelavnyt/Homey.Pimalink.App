'use strict';

const Homey = require('homey');
const https = require('https');

module.exports = class MyDevice extends Homey.Device {

  /**
  * Called when the user changes the picker in the UI
  * or when a Flow sets this capability.
  *
  * @param {string} value - "armed" | "disarmed" | "partially_armed"
  * @param {object} opts
  */
  async onHomeAlarmStateChange(value, opts) {
    this.log('homealarm_state ->', value);

    try {
      const webUserId = this.homey.settings.get('pimalink.webUserID');

      // Authentication
      const authResponse = await pimalinkApiPost(
        '/api/Panel/Authenticate',
        {
          "data": this.getSettings().user_code,
          "header": {
            "oSType": "2",
            "pairEntityId": this.getData().id,
            "webUserId": webUserId
          }
        }

      );

      let authBody = JSON.parse(authResponse.body);

      if (authResponse.statusCode !== 200) {
        if (authBody.errorCode == 45) {
          throw new Error('Incorrect User Code!\n Please Update in device settings');
        }
        else if (authBody.errorCode == 24) {
          throw new Error('Panel Busy');
        }
        else if (authBody.errorCode == 21) {
          throw new Error('Panel In Another Session');
        }
        else {
          this.log(authBody);
          throw new Error('Undefined Error');
        }
      }

      const sessionToken = authBody.sessionToken;

      if (value === 'armed') {
        const armResponse = await pimalinkApiPost(
          '/api/Panel/SetGeneralStatus',
          {
            "data": {
              "status": 2
            },
            "header": {
              "oSType": "2",
              "pairEntityId": this.getData().id,
              "sessionToken": sessionToken,
              "webUserId": webUserId
            }
          }
        );

        if (armResponse.statusCode !== 200) {
          // Disconnect
          await pimalinkApiPost(
            '/api/Panel/Disconnect',
            {
              "header": {
                "oSType": "2",
                "pairEntityId": this.getData().id,
                "sessionToken": sessionToken,
                "webUserId": webUserId
              }
            }
          );
          throw new Error('Error Arming');

        }
      }
      else if (value === 'disarmed') {
        const armResponse = await pimalinkApiPost(
          '/api/Panel/SetGeneralStatus',
          {
            "data": {
              "status": 1
            },
            "header": {
              "oSType": "2",
              "pairEntityId": this.getData().id,
              "sessionToken": sessionToken,
              "webUserId": webUserId
            }
          }
        );

        if (armResponse.statusCode !== 200) {
          // Disconnect
          await pimalinkApiPost(
            '/api/Panel/Disconnect',
            {
              "header": {
                "oSType": "2",
                "pairEntityId": this.getData().id,
                "sessionToken": sessionToken,
                "webUserId": webUserId
              }
            }
          );
          throw new Error('Error Arming');

        }
      }

      // Disconnect
      await pimalinkApiPost(
        '/api/Panel/Disconnect',
        {
          "header": {
            "oSType": "2",
            "pairEntityId": this.getData().id,
            "sessionToken": sessionToken,
            "webUserId": webUserId
          }
        }
      );

      return;
    } catch (err) {
      this.error('Failed to change alarm state:', err);

      // Throwing an error makes the UI revert to the previous value
      // and shows the message to the user.
      throw new Error(err.message);
    }
  }

  /**
   * onInit is called when the device is initialized.
   */
  async onInit() {
    this.log(this.getName() + ' has been initialized');

    // Set a default if nothing is set yet
    if (!this.getCapabilityValue('homealarm_state')) {
      await this.setCapabilityValue('homealarm_state', 'disarmed');
    }

    // Listen for user changes from the app / Flow
    this.registerCapabilityListener(
      'homealarm_state',
      this.onHomeAlarmStateChange.bind(this)
    );

    // --- ADD POLLING HERE ---
    this._pollIntervalMs = 5 * 1000;
    this._isPolling = false;

    this._pollingInterval = setInterval(() => this.pollAlarmState(), this._pollIntervalMs);

    // Run one immediate poll on boot
    this.pollAlarmState();
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

    // Clean up pooling
    if (this._pollingInterval) {
      clearInterval(this._pollingInterval);
    }

    //If the device's name in "unpair" than unpair it from the WebUserId
    if (name.toLowerCase() === 'unpair') {
      const webUserId = this.homey.settings.get('pimalink.webUserID');

      const response = await pimalinkApiPost(
        '/api/WebUser/UnPair',
        {
          "data": this.getData().id,
          "header": {
            "oSType": "2",
            "webUserId": webUserId
          }
        }

      );

      if (response.statusCode === 204) {
        this.log('successfully unpaired ' + this.getData().id + ' from the WebUserId');
      }
      else {
        this.log('Error unpairing ' + this.getData().id + '. \nError: ' + response.errorText);
      }
    }
  }

  async pollAlarmState() {
    if (this._isPolling) return; // prevent overlapping runs
    this._isPolling = true;

    try {
      const webUserId = this.homey.settings.get('pimalink.webUserID');

      const response = await pimalinkApiPost(
        '/api/WebUser/GetNotifications',
        {
          "data": false,
          "header": {
            "oSType": "2",
            "pairEntityId": this.getData().id,
            "webUserId": webUserId
          }
        }
      );

      if (response.statusCode !== 200 || !response.body) {
        this.log('pollAlarmState: bad response', JSON.parse(response.body).errorText);
        return;
      }

      let events;
      try {
        events = JSON.parse(response.body);
      } catch (err) {
        this.error('pollAlarmState: invalid JSON', err);
        return;
      }

      const newState = getLatestAlarmStateFromEvents(events);

      if (this.getCapabilityValue('homealarm_state') !== newState) {
        this.log('Updating state to', newState);
        await this.setCapabilityValue('homealarm_state', newState);
      }

    } catch (err) {
      this.error('Polling error:', err);
    } finally {
      this._isPolling = false;
    }
  }

};

function getLatestAlarmStateFromEvents(events) {
  if (!Array.isArray(events) || events.length === 0) return null;

  for (const evt of events) {
    const state = mapMessageToHomeAlarmState(evt.Message);
    if (state) {
      return state; // first relevant one = latest state
    }
  }

  // No relevant events in this batch
  return null;
}

function mapMessageToHomeAlarmState(message) {
  if (!message) return null;

  // Full arm
  if (message.includes('דריכה מלאה')) {
    return 'armed';
  }

  // Partial arm
  if (message.includes('המערכת דרוכה לבית')) {
    return 'partially_armed';
  }

  // System disarm
  if (message.includes('נטרול מערכת')) {
    return 'disarmed';
  }

  return null;
}

async function pimalinkApiPost(path, data) {
  return new Promise((resolve) => {
    try {
      const body = JSON.stringify(data)

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
