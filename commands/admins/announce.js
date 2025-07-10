const { Command } = require("discord.js-commando");
const Discord = require("discord.js");

module.exports = class AnnounceCommand extends Command {
  constructor(client) {
    super(client, {
      name: "announce",
      group: "admins",
      memberName: "announce",
      description: "Make a formatted announcement using embed data",
      throttling: {
        usages: 2,
        duration: 5,
      },
      args: [
        {
          key: "option",
          prompt: "Please choose a valid option `edit`, `append`, or `embed`",
          type: "string",
          oneOf: ["edit", "append", "embed"],
        },
        {
          key: "id",
          prompt: "Provide a message ID to edit or a channel mention/ID to send the embed.",
          type: "string",
          validate: (id) => {
            if (/^[0-9]{17,20}$/.test(id)) return true;
            return "Please enter a valid Discord snowflake (17–20 digits)!";
          },
        },
        {
          key: "body",
          prompt: "Please provide embed body (as JSON).",
          type: "string",
          validate: (body) => {
            try {
              const parsed = JSON.parse(body);
              if (parsed.description && parsed.description.length > 2048)
                return "Embed description must be under 2048 characters!";
              return true;
            } catch {
                return "Invalid JSON format. Please make sure your embed body is valid JSON.";
            }
          },
        },
      ],
    });
  }

  async run(message, { option, id, body }) {
    const embedData = JSON.parse(body);
    const embed = new Discord.MessageEmbed(embedData);

    switch (option) {
      case "edit":
        try {
          const msg = await message.channel.messages.fetch(id);
          await msg.edit(embed);
        } catch (err) {
          console.error(err);
          return message.reply("Failed to edit message. Make sure the ID is correct and the message is in this channel.");
        }
        break;

      case "append":
        try {
          const msg = await message.channel.messages.fetch(id);
          const existingEmbed = msg.embeds[0];
          const newDescription = (existingEmbed?.description || "") + " " + embedData.description;

          const updatedEmbed = new Discord.MessageEmbed(existingEmbed)
            .setDescription(newDescription);

          await msg.edit(updatedEmbed);
        } catch (err) {
          console.error(err);
          return message.reply("Failed to append to message. Check the message ID and try again.");
        }
        break;

      case "embed":
        try {
          const channelId = id.replace(/[<#>]/g, "");
          const targetChannel = this.client.channels.cache.get(channelId);

          if (!targetChannel || !targetChannel.send)
            return message.reply("Invalid channel ID or mention.");

          await targetChannel.send(embed);
        } catch (err) {
          console.error(err);
          return message.reply("Failed to send embed to channel.");
        }
        break;
    }

    if (message.deletable) message.delete();
  }
}; 