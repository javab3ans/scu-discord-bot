const { Command } = require("discord.js-commando");
const _ = require("lodash");
const dot = require("dot");
const fs = require("fs-extra");
const { Resend } = require("resend");
const uniqueID = new Set(); 

module.exports = class verifyCommand extends Command {
    constructor(client) {
        super(client, {
            name: "verify",
            group: "practicality",
            memberName: "verify",
            description: "Verify yourself as a student or faculty/staff member.",
            throttling: {
                usages: 2,
                duration: 5,
            },
            args: [
                {
                    key: "emailAddress",
                    prompt: "Please enter your SCU email!",
                    type: "string",
                    oneOf: ["bbronco@scu.edu"],
                    validate: (emailAddress) => {
                        if (/\w+@scu.edu$/.test(emailAddress) || /\w+@alumni.scu.edu/.test(emailAddress)) {
                            return true;
                        } else {
                            return "Please enter a valid email address!";
                        }
                    }
                },
                {
                    key: "roleOptions",
                    prompt: "Please choose a valid option: `student or scu faculty/staff`",
                    type: "string",
                    oneOf: ["student", "scu faculty/staff"],
                }
            ]
        });
    }

    async run(message, { emailAddress, roleOptions }) {
        message.delete();

        if (message.member.roles.cache.some(role => role.name === "student") ||
            message.member.roles.cache.some(role => role.name === "scu faculty/staff")) {
            return this.client.error("This user is already verified!", message);
        }

        if (message.channel.id !== this.client.config.channels.access) {
            return this.client.error(`This can only be used in the <#${this.client.config.channels.access}> channel!`, message);
        }

        if (!uniqueID.has(message.author.id)) {
            uniqueID.add(message.author.id);
        }

        const resend = new Resend(this.client.config.resend_api_key); 

        const rawHTML = await fs.readFile("./assets/templateFiles/email.html", "utf8");
        const tempFn = dot.template(rawHTML);
        const keycode = [0, 0, 0, 0].map(() => _.random(0, 9)).join("");
        const result = tempFn({ keycode });

        try {
            await resend.emails.send({
                from: `SCU Discord Network <onboarding@resend.dev>`,
                to: emailAddress,
                subject: `${message.guild.name} Verification`,
                html: result,
                text: `Thank you for verifying yourself in the server!\nVerification Code: ${keycode}\nRespond in the <#${this.client.config.channels.access}> channel within 5 minutes.`,
            });

            await message.author.send({
                embed: {
                    title: "Email sent successfully!",
                    description: `Email sent to **${emailAddress}**. Check your school email for the verification code and enter it in the <#${this.client.config.channels.access}> channel within 5 minutes!`,
                    color: this.client.config.school_color
                }
            });

            const keycodeFilter = (m) => {
                if (m.author.bot) return false;
                if (m.toString() === keycode) return true;
                this.client.error("Invalid keycode. Please try again.", m);
                return false;
            };

            await message.channel.awaitMessages(keycodeFilter, {
                max: 1,
                time: 300000,
                errors: ["time"]
            }).then(collected => collected.first().delete());

            let role = message.guild.roles.cache.find(role => role.name === roleOptions);
            await message.member.roles.add(role);

            await message.author.send(`<@${message.author.id}>`, {
                embed: {
                    title: "Welcome to the Santa Clara University Discord Network!",
                    description: `You have been verified! You can now access the rest of the server and select your roles in the <#${this.client.config.channels.roles}> channel!`,
                    color: this.client.config.school_color
                }
            });
        } catch (error) {
            return this.client.error("Error occurred while sending email. Please redo the command.", message);
        }

        uniqueID.delete(message.author.id);
    }
}; 