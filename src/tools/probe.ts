import { NvtProvider, parseLoginForm, parseMethod, CONFIG } from '../provider/nvt';
import { GatewayTransport, GATEWAY } from '../provider/transport';
import { publicError } from '../shared/types';

// Public protocol discovery only. Never accepts passwords on the command line or from environment variables.
async function main() {
  const transport = new GatewayTransport();
  try {
    const response = await transport.request(GATEWAY + '/');
    const form = parseLoginForm(response.body.toString(), response.url);
    const config = await transport.request(CONFIG);
    const method = parseMethod(config.body.toString());
    console.log(JSON.stringify({ loginPage: new URL(response.url).pathname, action: new URL(form.action).pathname, method, fields: ['uname', 'pwd', 'pwd1', 'pwd2', 'method'], status: 'public login structure verified; authenticated login not tested' }, null, 2));
  } catch (error) { console.error(publicError(error)); process.exitCode = 1; }
  finally { transport.clear(); }
}
void main();
