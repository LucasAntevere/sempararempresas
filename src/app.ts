import { EmailReportsConfig } from "./models/EmailReportsConfig.js";
import { ResponseMessage } from "./models/ResponseMessage.js";
import { MQTT } from "./mqtt.js";
import { EmailReports } from "./reports/EmailReports.js";

(async () => {
  let mqtt = new MQTT();

  let address : string = process.env.MQTT_ADDRESS ? process.env.MQTT_ADDRESS! : (() => { throw new Error("MQTT Address not found"); })();
  let username : string = process.env.MQTT_USERNAME ? process.env.MQTT_USERNAME! : (() => { throw new Error("Username not found"); })();
  let password : string = process.env.MQTT_PASSWORD ? process.env.MQTT_PASSWORD! : (() => { throw new Error("Password not found"); })();

  await mqtt.Connect(address, username, password);

  let emailReport: EmailReports | null = null;

  mqtt.OnMessageReceived.subscribe(async (message: ResponseMessage<EmailReportsConfig>) => {
    switch (message.topic) {
      case 'semparar/sendReportsToEmail':
        if (emailReport != null) {
          await emailReport.Quit();
          emailReport = null;
        }

        if (message.response == null)
          return;

        emailReport = new EmailReports(mqtt, message.response!);
        await emailReport.Send();
        emailReport = null;
        break;
    }
  });
})();