import { ResponseMessage } from "./models/ResponseMessage.js";
import rxjs from "rxjs";
import { Message } from "./models/Message.js";
import mqtt from "mqtt";

export class MQTT {
    client?: mqtt.MqttClient;

    public OnMessageReceived = new rxjs.Subject<ResponseMessage<any>>();

    async Connect(url: string, username: string, password: string) {
        this.client = await mqtt.connectAsync(url, {
            username: username,
            password: password
        });

        this.client.subscribe('semparar/#', (err) => {
            if (err) {
                console.error(`Client Subscription Error: ${err}`);
            } else {
                console.info(`Listening to topics "semparar/#"...`);
            }
        });

        this.client.on("message", async (topic, message) => {
            try {
                let jsonResponse = JSON.parse(message.toString());

                let response = new ResponseMessage<any>();
                response.topic = topic;
                response.response = jsonResponse;

                this.OnMessageReceived.next(response);

                console.info(response);
            } catch (error) {
                console.error(`Client On Message Received Error: ${error}`);
            }
        });
    }

    async SendMessage<T>(message: Message): Promise<T | null> {
        return new Promise<T | null>(async (resolve, reject) => {
            await this.client?.publishAsync('semparar/message', JSON.stringify(message));

            if ((message?.notification?.data?.actions?.length ?? 0) > 0) {
                let subscription = this.OnMessageReceived.subscribe((response: ResponseMessage<T>) => {
                    if (response.topic == `semparar/${message.notification?.data?.tag ?? ""}${message.notification?.data?.group ?? ""}${message.notification?.message}`) {
                        resolve(response.response);
                        subscription.unsubscribe();
                    }
                });

                setTimeout(() => { reject("Timeout"); subscription.unsubscribe(); }, 120 * 1000);
            } else {
                resolve(null);
            }
        });
    }
}