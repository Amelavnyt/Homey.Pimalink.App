'use strict';

const Homey = require('homey');
const https = require('https');

module.exports = class MyDriver extends Homey.Driver {

  /**
   * onInit is called when the driver is initialized.
   */
  async onInit() {
    this.log('Pimalink driver has been initialized');
    this.log('User Email: ' + this.homey.settings.get('pimalink.userEmail'));
    this.log('User Phone Number: ' + this.homey.settings.get('pimalink.userPhone'));
  }

  onPair(session) {
    const webUserId = this.homey.settings.get('pimalink.webUserID')


    session.setHandler("set_user_settings", async ({ email, phone }) => {

      const response = await (async () => {
        let res = await pimalinkApiPost(
          webUserId,
          '/api/WebUser/SetWebUserDetails',
          { name: 'Homey', email, phone }
        );

        let body;
        try {
          body = res.body ? JSON.parse(res.body) : {};
        } catch (e) {
          body = {};
        }

        if (body.errorText === 'ActionFaild-InvalidWebUserID') {
          // call the config API first
          await pimalinkApiPost(webUserId, '/api/WebUser/Config/en');

          // retry
          res = await pimalinkApiPost(
            webUserId,
            '/api/WebUser/SetWebUserDetails',
            { name: 'Homey', email, phone }
          );
        }

        return res;
      })();

      if (response.statusCode == 204) {
        this.homey.settings.set('pimalink.userEmail', email);
        this.homey.settings.set('pimalink.userPhone', phone);
        return true;
      }
      else
        return false;
    });

    session.setHandler("get_user_settings", async () => {
      return {
        email: this.homey.settings.get('pimalink.userEmail') || '',
        phone: this.homey.settings.get('pimalink.userPhone') || ''
      };
    });

    session.setHandler("pair_to_webUserID", async ({ deviceName, pairingCode }) => {
      const webUserId = this.homey.settings.get('pimalink.webUserID');

      const response = await pimalinkApiPost(
        webUserId,
        '/api/WebUser/Pair',
        {
          name: deviceName,
          pairingCode: pairingCode
        }
      );

      let body;
      try {
        body = response.body ? JSON.parse(response.body) : {};
      } catch (e) {
        body = {};
      }

      this.log(body);

      if (body.errorText === 'ActionFaild-PairingAlreadyExist' || response.statusCode == 204)
        return true;
      else
        return false;
    });


    session.setHandler('list_devices', async () => {
      return this.onPairListDevices(session); // or inline the array
    });
  }



  /**
   * onPairListDevices is called when a user is adding a device
   * and the 'list_devices' view is called.
   * This should return an array with the data of devices that are available for pairing.
   */
  async onPairListDevices(session) {
    const webUserId = this.homey.settings.get('pimalink.webUserID');

    const response = await pimalinkApiPost(
      webUserId,
      '/api/WebUser/GetPairEntities',
    );

    if (JSON.parse(response.body) == null) {
      await session.prevView();
    }

    let devices = []
    JSON.parse(response.body).forEach(device => {
      devices.push({
        name: device.name,
        data: {
          id: device.pairId
        }
      });
    });

    return devices;
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
