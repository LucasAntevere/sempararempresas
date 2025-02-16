import { Browser, Builder, By, Key, until, WebDriver, WebElementPromise } from "selenium-webdriver";
import { EmailReportsConfig } from "../models/EmailReportsConfig.js";
import { Message } from "../models/Message.js";
import { Notification } from "../models/Notification.js";
import dayjs from "dayjs";
import { MQTT } from "../mqtt.js";
import { NotificationActionResponse } from "../models/NotificationActionResponse.js";
import { Options } from "selenium-webdriver/firefox.js";

export class EmailReports {
  driver?: WebDriver;

  private mqtt: MQTT;
  private config: EmailReportsConfig;

  constructor(mqtt: MQTT, config: EmailReportsConfig) {
    this.mqtt = mqtt;
    this.config = config;
  }

  get(locator: By): WebElementPromise {
    try {
      return this.driver!.wait(until.elementLocated(locator), 10 * 1000);
    } catch (error) {
      return null as unknown as WebElementPromise;
    }
  }

  async contains(locator: By, text: string): Promise<boolean> {
    try {
      await this.driver!.wait(until.elementTextContains(this.get(locator), text), 10 * 1000);
      return true;
    } catch {
      return false;
    }
  }

  async containsReturns<T>(locator: By, text: string, returnValue: T): Promise<T | null> {
    try {
      await this.driver!.wait(until.elementTextContains(this.get(locator), text), 10 * 1000);
      return returnValue;
    } catch {
      return null;
    }
  }

  async Send() {
    let reportsSent: boolean = false;
    let message: Message = new Message();
    message.topic = "semparar/sendReportsToEmail";
    message.notification = new Notification();

    try {
      message.notification.title = "Sem Parar";
      message.notification.message = "Iniciando envio de relatórios";
      message.notification.data.tag = "semparar-sendReportsToEmail";
      message.notification.data.progress = 0;
      message.notification.data.progress_max = 100;

      await this.mqtt.SendMessage(message);

      let browserUrl: string | undefined = process.env.BROWSER_URL;
      let browserHeadless: boolean = (process.env.BROWSER_HEADLESS ?? 'true') == 'true';

      let options = new Options();

      if (browserHeadless)
        options = options.addArguments('--headless');

      if (browserUrl)
        this.driver = new Builder().forBrowser(Browser.FIREFOX).setFirefoxOptions(options).usingServer(browserUrl).build();
      else
        this.driver = new Builder().forBrowser(Browser.CHROME).build();

      await this.driver.get('https://www.sempararempresas.com.br/login');
      await this.get(By.id('UserName')).sendKeys(this.config.username!);
      await this.get(By.id('password')).sendKeys(this.config.password!);

      let iframes = await this.driver.findElements(By.id('mt-captcha-1-iframe-1'));

      let captchaSolved = false;

      // Check if captcha is present
      if (iframes.length > 0) {
        await this.driver.switchTo().frame(iframes[0]);
        try {
          await this.driver.wait(until.elementsLocated(By.id('mtcap-image-1')), 10 * 1000);
          captchaSolved = false;
        } catch (error) {
          captchaSolved = true;
        } finally {
          await this.driver.switchTo().parentFrame();
        }
      }

      if (!captchaSolved) {
        let regex = new RegExp(/,(.*?)"/);

        await this.driver.switchTo().frame(iframes[0]);

        while (!captchaSolved) {
          let captchaCss = await this.get(By.id('mtcap-image-1')).getCssValue('background-image');
          let captchaBase64 = regex.exec(captchaCss)![1];
          ;
          message.notification.title = "Sem Parar: Resolva a captcha";
          message.notification.message = "Resolva a captcha";
          message.notification.data.image = captchaBase64;
          message.notification.data.actions = [{
            action: "REPLY",
            title: "Resolver"
          },
          {
            action: "CANCEL",
            title: "Cancelar"
          }];

          let solvedCaptcha = await this.mqtt.SendMessage<NotificationActionResponse>(message);

          if (solvedCaptcha?.action == "CANCEL") {
            return;
          }

          message.notification.data.image = undefined;
          message.notification.data.actions = [];

          await this.get(By.id('mtcap-inputtext-1')).clear();
          await this.get(By.id('mtcap-inputtext-1')).sendKeys(solvedCaptcha!.text!, Key.RETURN);

          await this.driver.sleep(2 * 1000);

          let captchaResult = await Promise.race([
            this.containsReturns<string>(By.id('mtcap-msg-1'), 'sucesso', 'success'),
            this.containsReturns<string>(By.id('mtcap-msg-1'), 'tente novamente', 'fail'),
            this.containsReturns<string>(By.id('mtcap-msg-1'), 'caracteres', 'length')
          ]);

          captchaSolved = captchaResult == 'success';

          if (!captchaSolved) {
            message.notification.title = "Sem Parar";
            message.notification.message = "Captcha não resolvida";
            await this.mqtt.SendMessage(message);
            continue;
          }

          await this.driver.switchTo().parentFrame();
        }
      }

      message.notification.title = `Sem Parar`;
      message.notification.message = "Carregando o portal...";
      message.notification.data.progress = 10;
      await this.mqtt.SendMessage(message);

      await this.get(By.id('btn-entrar')).click();

      try {
        await this.driver.wait(until.urlContains('Default.aspx'), 60 * 1000);
      } catch (error) {
        throw new Error(`Erro ao carregar a página inicial do portal: ${error}`);
      }

      let startdate = dayjs().subtract(this.config.pastDays ?? 30, 'days').format('DD/MM/YYYY');
      let enddate = dayjs().format('DD/MM/YYYY');

      message.notification.title = `Sem Parar`;
      message.notification.message = `Iniciando envio de relatórios de ${startdate} até ${enddate}`;
      message.notification.data.progress = 25;
      await this.mqtt.SendMessage(message);

      // // Click on Financeiro
      // await this.driver.findElement(By.css('#panelbar > li:nth-child(4)')).click();

      // // Click on Período Personalizado
      // await this.driver.findElement(By.css('#panelbar > li:nth-child(4) > ul > li:nth-child(3) a')).click();

      // await this.driver.findElement(By.id('DataPeriodoInicio')).sendKeys('01/02/2025 00:00');
      // await this.driver.findElement(By.id('DataPeriodoFim')).sendKeys('28/02/2025 23:59');
      // await this.driver.findElement(By.id('btnConsultarPeriodoPersonalizado')).click();

      let mainFrame = this.get(By.name('main'));

      await this.driver.switchTo().frame(mainFrame);

      await this.get(By.css('#menu_lateral_geral a:nth-child(3)')).click();

      await this.driver.sleep(1000);

      await this.get(By.id('dataInicialRelatorioLancamentoSTP')).sendKeys(startdate);
      await this.get(By.id('dataFinalRelatorioLancamentoSTP')).sendKeys(enddate);
      await this.get(By.id('txaMsgRelatorioLancamentoSTP')).sendKeys(`Relatório de ${startdate} até ${enddate}`);

      let sendMessages: string[] = [];

      for (let indexEmail in this.config.emails) {
        await this.get(By.id('txtEmailRelatorioLancamentoSTP')).sendKeys(this.config.emails[indexEmail]);
        await this.get(By.id('btnEnviarRelatorioLancamentoSTP')).click();

        await this.driver.sleep(1000);
        await this.get(By.id('btnGerarExcel')).click();


        let success = await this.contains(By.css('.ValidateSummaryInformation'), 'sucesso');

        if (success) {
          message.notification.title = `Sem Parar`;
          message.notification.message = `Relatório de lançamento enviado para ${this.config.emails[indexEmail]}`;
          message.notification.data.progress = 50;
          await this.mqtt.SendMessage(message);
        } else {
          message.notification.title = `Sem Parar: Erro relatório de lançamento > ${this.config.emails[indexEmail]}`;
          message.notification.message = (await this.get(By.css('.ValidateSummaryInformation'))?.getText()) ?? "Erro desconhecido";
          message.notification.data.progress = 50;
          await this.mqtt.SendMessage(message);
        }

        sendMessages.push(`Relatório de lançamento para ${this.config.emails[indexEmail]}: ${success ? "Sucesso! ✅" : "Falha! ❌"}`);
      }

      // Click on Recibo de viagens
      await this.get(By.css('#menu_lateral_geral a:nth-child(4)')).click();

      await this.get(By.id('DataInicio')).sendKeys(startdate);
      await this.get(By.id('DataFim')).sendKeys(enddate);

      for (let indexEmail in this.config.emails) {
        await this.get(By.id('Email')).sendKeys(this.config.emails[indexEmail]);
        await this.get(By.id('btnEnviar')).click();

        let success = await this.contains(By.css('.ValidateSummaryInformation'), 'Os recibos foram enviados para o email informado');

        if (success) {
          message.notification.title = `Sem Parar`;
          message.notification.message = `Recibos de viagem enviados para ${this.config.emails[indexEmail]}`;
          message.notification.data.progress = 75;
          await this.mqtt.SendMessage(message);
        } else {
          message.notification.title = `Sem Parar: Erro recibos de viagem > ${this.config.emails[indexEmail]} `;
          message.notification.message = (await this.get(By.css('.ValidateSummaryInformation'))?.getText()) ?? "Erro desconhecido";
          message.notification.data.progress = 75;
          await this.mqtt.SendMessage(message);
        }

        sendMessages.push(`Relatório de viagem para ${this.config.emails[indexEmail]}: ${success ? "Sucesso! ✅" : "Falha! ❌"}`);
      }

      message.notification.data.progress = 100;
      message.notification.title = `Sem Parar: Envios finalizados com sucesso! 🥳`;
      message.notification.message = sendMessages.join('\n');
      await this.mqtt.SendMessage(message);
    } catch (error) {
      message.notification.title = `Sem Parar: Envios finalizados com falha! 😭`;
      message.notification.message = error?.toString() ?? "Erro desconhecido";
      message.notification.data.progress = 100;
      await this.mqtt.SendMessage(message);
    } finally {
      await this.Quit();
    }
  }

  async Quit() {
    await this.driver?.quit();
  }
}