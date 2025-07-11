const { MessageEmbed, Collection } = require("discord.js");
const db = require("../functions/db.js"); // your lowdb instance
const fs = require("fs");
const jsdom = require("jsdom");
const { JSDOM } = jsdom;
const dom = new JSDOM();
const document = dom.window.document;
const { log } = require("../functions/log.js"); 

module.exports = async (client, message) => {
  // Ignore bots, non-prefix DMs and messages outside guilds
  if (
    (!message.content.startsWith(client.config.prefix) && message.channel.type !== "dm") ||
    message.author.bot
  )
    return;

  const messageReception = new MessageEmbed()
    .setColor(client.config.school_color)
    .setAuthor(message.author.tag, message.author.displayAvatarURL());

  try {
    if (message.channel.type === "dm" && message.mentions.has(client.user)) {
      const userTicketContent = message.content.split(" ").slice(1).join(" ").trim();

      if (userTicketContent.length > 0 || message.attachments.size > 0) {
        let user = db.get(`suspended${message.author.id}`).value() || false;

        const pauseEmbed = new MessageEmbed()
          .setColor(client.config.school_color)
          .setAuthor(message.author.tag, message.author.displayAvatarURL())
          .setDescription("Your ticket has been paused!")
          .setFooter(`ModMail Ticket Paused -- ${message.author.tag}`)
          .attachFiles(["./assets/paused.gif"])
          .setThumbnail("attachment://paused.gif");

        if (user === true || user === "true")
          return await message.channel.send(pauseEmbed);

        let active = db.get(`support_${message.author.id}`).value();
        let guild = client.guilds.cache.get(client.config.verification.guildID);
        let channel;
        let found = true;

        try {
          if (active) client.channels.cache.get(active.channelID).guild;
        } catch (e) {
          found = false;
        }

        if (!active || !found) {
          // create support channel for new user
          try {
            channel = await guild.channels.create(`${message.author.username}-${message.author.discriminator}`, {
              type: "GUILD_TEXT",
              parent: client.config.channels.supportTicketsCategory,
              topic: `Use **${client.config.prefix}cmds** to utilize the Ticket | ModMail commands on behalf of <@${message.author.id}>`,
              permissionOverwrites: [
                {
                  id: client.config.verification.guildID,
                  deny: ["VIEW_CHANNEL"],
                },
              ],
            });

            active = {
              channelID: channel.id,
              targetID: message.author.id,
            };

            db.set(`support_${message.author.id}`, active).write();

            messageReception
              .setTitle("ModMail Ticket Created")
              .setThumbnail("attachment://verified.gif")
              .setDescription(
                "Hello, I've opened up a new ticket for you! The admin will respond shortly. If you need to add to your ticket, plug away again!"
              )
              .setFooter(`ModMail Ticket Created -- ${message.author.tag}`)
              .attachFiles(["./assets/verified.gif"]);

            await message.author.send(messageReception);
          } catch (err) {
            if (err.message.includes("INVALID_TYPE")) return;
            throw err;
          }
        } else {
          channel = client.channels.cache.get(active.channelID);
        }

        // Notify user that content was sent
        const notifyEmbed = new MessageEmbed()
          .setTitle("Modmail Ticket Sent!")
          .setDescription("Your new content was sent!")
          .setFooter(`ModMail Ticket Received -- ${message.author.tag}`)
          .setColor(client.config.school_color);

        await message.author.send(notifyEmbed);

        db.set(`support_${message.author.id}`, active).write();
        db.set(`supportChannel_${channel.id}`, message.author.id).write();

        // Prepare embed to send to support channel with user content
        const contentEmbed = new MessageEmbed()
          .setColor(client.config.school_color)
          .setAuthor(message.author.tag, message.author.displayAvatarURL())
          .setDescription(userTicketContent.length > 0 ? `> ${userTicketContent}` : "");

        if (message.attachments.size > 0) {
          const url = message.attachments.first().url;
          if (url) contentEmbed.setImage(url);
        }

        return await channel.send(contentEmbed);
      } else {
        // No content or attachments, prompt user
        return await client.error(
          `To open a ticket, mention <@${client.user.id}> and type your message and/or send an attachment!`,
          message
        );
      }
    } else if (
      message.channel.type === "dm" &&
      (!message.mentions.has(client.user) || message.attachments.size > 0)
    ) {
      return await client.error(
        `To open a ticket, mention <@${client.user.id}> and type your message and/or send an attachment!`,
        message
      );
    }

    // Handle messages in modmail support channels
    let support = db.get(`supportChannel_${message.channel.id}`).value();

    if (support) {
      support = db.get(`support_${support}`).value();
      if (!support) return message.channel.delete();

      const supportUser = client.users.cache.get(support.targetID);
      if (!supportUser) return message.channel.delete();

      function modmailCommands() {
        const commands = [
          { cmd: "complete", desc: "Close a ticket channel and logs the support channel`s content!" },
          { cmd: "continue", desc: "Continue the modmail session!" },
          { cmd: "pause", desc: "Pause the modmail session!" },
          { cmd: "reply", desc: "DM the user who sent the modmail ticket!" },
        ];
        let str = "```\n";
        for (let i in commands) {
          str += `${client.config.prefix}${commands[i].cmd} - ${commands[i].desc}\n`;
        }
        return str + "\n```";
      }

      messageReception.setAuthor(supportUser.tag, supportUser.displayAvatarURL()).setTimestamp();

      const isPause = db.get(`suspended${support.targetID}`).value() || false;
      const modmailArgs = message.content.split(" ").slice(1);

      switch (message.content.split(" ")[0].slice(1).toLowerCase()) {
        case "cmds":
          messageReception.setTitle("**MODMAIL COMMANDS!**").setColor(client.config.default_color).setDescription(modmailCommands());
          await message.channel.send(messageReception);
          break;

        case "complete":
          if (isPause === true || isPause === "true")
            return client.error("Continue the support user's thread before completing the ticket!", message);

          messageReception
            .setTitle("ModMail Ticket Resolved")
            .setFooter(`ModMail Ticket Closed -- ${supportUser.tag}`)
            .setDescription(
              `*Your ModMail has been marked as **complete** and has been logged by the admin. If you wish to create a new one, please send a message to the bot.*`
            );

          await supportUser.send(messageReception);

          let messageCollection = new Collection();
          let channelMessages = await message.channel.messages.fetch({ limit: 100 });

          messageCollection = messageCollection.concat(channelMessages);

          while (channelMessages.size === 100) {
            let lastMessageId = channelMessages.lastKey();
            channelMessages = await message.channel.messages.fetch({ limit: 100, before: lastMessageId });
            if (channelMessages) {
              messageCollection = messageCollection.concat(channelMessages);
            }
          }

          let msgs = messageCollection.array().reverse();

          const filePath = `./events/modmailLogs/index_${supportUser.tag}.html`;

          let template = fs.readFileSync("./assets/templateFiles/template.html", "utf8");
          fs.writeFileSync(filePath, template);

          let guildElement = document.createElement("div");
          guildElement.className = "img-container";

          let guildBannerImg = document.createElement("img");
          guildBannerImg.setAttribute(
            "src",
            "https://raw.githubusercontent.com/JAVAB3ANS/scu-discord-bot/master/assets/scu_banner.png?raw=true"
          );
          guildBannerImg.setAttribute("width", "500");
          guildElement.appendChild(guildBannerImg);

          let guildBreak = document.createElement("br");
          guildElement.appendChild(guildBreak);

          let guildTicketImg = document.createElement("img");
          guildTicketImg.setAttribute(
            "src",
            "https://raw.githubusercontent.com/JAVAB3ANS/scu-discord-bot/master/assets/scu_modmail_ticket.png?raw=true"
          );
          guildTicketImg.setAttribute("width", "500");
          guildElement.appendChild(guildTicketImg);

          fs.appendFileSync(filePath, guildElement.outerHTML);

          for (const msg of msgs) {
            let parentContainer = document.createElement("div");
            parentContainer.className = "parent-container";

            let avatarDiv = document.createElement("div");
            avatarDiv.className = "avatar-container";

            let img = document.createElement("img");
            img.setAttribute("src", msg.author.displayAvatarURL());
            img.className = "avatar";
            avatarDiv.appendChild(img);
            parentContainer.appendChild(avatarDiv);

            const messageContainer = document.createElement("div");
            messageContainer.className = "message-container";

            const spanElement = document.createElement("span");
            const codeNode = document.createElement("code");

            let nameElement = document.createElement("span");
            let name = document.createTextNode(
              `[${msg.author.tag}] [${msg.createdAt.toDateString()}] [${msg.createdAt.toLocaleTimeString()} PST]`
            );
            nameElement.appendChild(name);
            messageContainer.appendChild(nameElement);

            for (const embed of msg.embeds) {
              try {
                const embedElements = [
                  `Title: ${embed.title}`,
                  `Description: ${embed.description}`,
                  `Footer: ${embed.footer?.text ?? ""}`,
                ];

                for (const element of embedElements) {
                  const paragraph = document.createElement("p");
                  paragraph.appendChild(document.createTextNode(element));
                  const embedSpan = document.createElement("span");
                  embedSpan.appendChild(paragraph);
                  messageContainer.appendChild(embedSpan);
                }
              } catch {
                  // ignore embed errors
                  console.error("Error processing embed:", embed);
              }
            }

            if (msg.content.startsWith("```")) {
              codeNode.appendChild(document.createTextNode(msg.content.replace(/```/g, "")));
              messageContainer.appendChild(codeNode);
            } else if (msg.content) {
              spanElement.appendChild(document.createTextNode(msg.content));
              messageContainer.appendChild(spanElement);
            }

            parentContainer.appendChild(messageContainer);
            fs.appendFileSync(filePath, parentContainer.outerHTML);
          }

          // Attach the log file to embed
          messageReception.attachFiles(filePath);
          log(client, client.config.channels.auditlogs, { embed: messageReception });

          await message.channel.delete();
          db.unset(`support_${support.targetID}`).write();
          break;

        case "continue":
          if (isPause === false || isPause === "false")
            return client.error("This ticket was not paused.", message);

          db.unset(`suspended${support.targetID}`).write();

          messageReception
            .setTitle("Modmail Ticket Continued!")
            .setDescription(`<@${supportUser.id}>, your thread has **continued**! We're ready to continue!`)
            .setColor("BLUE")
            .attachFiles(["./assets/continued.gif"])
            .setThumbnail("attachment://continued.gif")
            .setFooter(`ModMail Ticket Continued -- ${supportUser.tag}`);

          await supportUser.send(messageReception);
          await message.channel.send(messageReception);
          log(client, client.config.channels.auditlogs, { embed: messageReception });
          break;

        case "pause":
          if (isPause === true || isPause === "true")
            return client.error("This ticket already paused. Unpause it to continue!", message);

          db.set(`suspended${support.targetID}`, true).write();

          messageReception
            .setTitle("Modmail Ticket Paused!")
            .setDescription(`<@${supportUser.id}>, your thread has been **paused**!`)
            .setColor("YELLOW")
            .attachFiles(["./assets/paused.gif"])
            .setThumbnail("attachment://paused.gif")
            .setFooter(`ModMail Ticket Paused -- ${supportUser.tag}`);

          await supportUser.send(messageReception);

          messageReception.setDescription(`Admin, please use \`${client.config.prefix}continue\` to cancel.`);

          await message.channel.send(messageReception);
          log(client, client.config.channels.auditlogs, { embed: messageReception });
          break;

        case "reply":
          await message.delete();
          if (isPause === true || isPause === "true")
            return client.error("This ticket is already paused. Unpause it to continue.", message);

          let replyMsg = modmailArgs.join(" ");
          if (!replyMsg) return client.error("Please enter a message for the support ticket user!", message);

          const replyEmbed = new MessageEmbed()
            .setTitle(`**Admin replied to you!**`)
            .setFooter(`ModMail Ticket Replied -- ${supportUser.tag}`)
            .setDescription(`> ${replyMsg}`)
            .attachFiles(["./assets/reply.gif"])
            .setThumbnail("attachment://reply.gif");

          if (message.attachments.size > 0) {
            const url = message.attachments.first().url;
            if (url) replyEmbed.setImage(url);
          }

          await supportUser.send(replyEmbed);
          await message.channel.send(replyEmbed);
          log(client, client.config.channels.auditlogs, { embed: replyEmbed });
          break;

        default:
          await message.react("❌");
          setTimeout(() => message.delete().catch(() => {}), 3000);
          break;
      }
    }
  } catch (err) {
    if (err.message.includes("Cannot send messages to this user")) return;
    console.error(err);
  }
}; 