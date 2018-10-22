const fs = require("fs");
const { Composer } = require("micro-bot");
const fastify = require("fastify")({ logger: false });
const log = msg => {
	msg = `[${new Date().toISOString()}] ${msg}`;
	console.log(msg);
	logBuffer.push(msg);
	if(logBuffer.length > 50) logBuffer.shift();
};
const groupId = Number(process.env.GROUP_ID);
const verifiedStorage = "verified.json";
const verificationPeriod = 5; // new chat memebers must reply in X minutes
const memberToString = member => member.username || `${member.first_name || ""} ${member.last_name || ""}`.trim() || member.id;
const memberGreeting = member => `Здрасти, ${memberToString(member)}! Пиши ни нещо, да знаем че не си бот... ;)`;
let logBuffer = [];
let verified = [];
let unknown = [];
let msgBuffer = {};

try {
	fs.readFile(verifiedStorage, (err, data) => {
		if (err) {
			throw err;
		}
		try {
			verified = JSON.parse(data);
			log(`Loaded ${verified.length} verified member(s) from storage`);
		} catch(err) {
			log(`Loading storage failed`);
			throw err;
		}
	});
} catch(err) {
	log(`Reading file failed`);
	throw err;
}

const syncVerified = id => {
	try {
		fs.writeFile(verifiedStorage, JSON.stringify(verified), (err) => {
			if (err) {
				throw err;
			} else {
				log(`Verified members array synced with storage`);
			}
		});
	} catch (err) {
		log(`Writing file failed`);
		throw err;
	}
};

const addMemberMessage = (memberId, messageId) => {
	if(msgBuffer.hasOwnProperty(memberId)) {
		msgBuffer[memberId].push(messageId);
	} else {
		msgBuffer[memberId] = [messageId];
	}
};

const deleteMemberMessages = (ctx, chatId, memberId) => {
	msgBuffer[memberId].forEach(messageId => {
		ctx.telegram.deleteMessage(chatId, messageId)
			.catch(err => console.warn('ctx.telegram.deleteMessage error: ', err));
	});

	delete msgBuffer[memberId];
};

const handleNewChatMembers = ctx => {
	if(ctx.update.message.chat.id !== groupId) {
		return;
	}

	ctx.update.message.new_chat_members.forEach((member) => {
		if(member.id === ctx.botInfo.id) {
			log(`${memberToString(ctx.botInfo)} bot has joined a channel`);
			return;
		}

		if(verified.includes(member.id)) {
			log(`${memberToString(member)} has joined and is a verified member`);
		} else {
			unknown.push(member.id);
			log(`${memberToString(member)} has joined and is added to the unknown members array`);

			log(`${memberToString(ctx.botInfo)}: ${memberGreeting(member)}`);
			ctx.reply(memberGreeting(member))
				.then(message => addMemberMessage(member.id, message.message_id))
				.catch(err => console.warn('ctx.reply error: ', err));

			setTimeout((memberId, chatId) => {
				if(unknown.includes(memberId)) {
					log(`${memberToString(member)} did not reply on time, kicking...`);
					ctx.kickChatMember(memberId)
						.catch(err => console.warn('ctx.kickChatMember error: ', err));
					deleteMemberMessages(ctx, chatId, memberId);
					unknown = unknown.filter(item => item !== memberId);
				}
			}, verificationPeriod * 1000 * 60, member.id, ctx.update.message.chat.id);

			log(`${memberToString(member)} has been messaged, waiting for a reply...`);
		}
	});
};

const handleMessage = ctx => {
	if(ctx.update.message.chat.id === groupId) {
		log(`${memberToString(ctx.update.message.from)}: ${ctx.update.message.text}`);

		if(unknown.includes(ctx.update.message.from.id)) {
			addMemberMessage(ctx.update.message.from.id, ctx.update.message.message_id);
			unknown = unknown.filter(item => item !== ctx.update.message.from.id);
			verified.push(ctx.update.message.from.id);
			log(`${memberToString(ctx.update.message.from)} has responded and is moved to the verified members array`);

			syncVerified(ctx.update.message.from.id);
			deleteMemberMessages(ctx, ctx.update.message.chat.id, ctx.update.message.from.id);
		}
	} else {
		log(`Message outside scope >> (id: ${ctx.update.message.chat.id}, username: ${ctx.update.message.from.username}, type: ${ctx.update.message.chat.type}) >> ${memberToString(ctx.update.message.from)}: ${ctx.update.message.text}`);
	}
};

const bot = new Composer();

bot.on("text", ctx => handleMessage(ctx));
bot.on("new_chat_members", ctx => handleNewChatMembers(ctx));

fastify.get("/log", (request, reply) => reply.send(logBuffer.join("\n")));
fastify.listen(3000, (err, address) => {
	if (err) throw err;
	fastify.log.info(`Server listening on ${address}`);
});

module.exports = bot;
