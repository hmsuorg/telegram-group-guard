const log = (msg) => { console.log(`[${new Date().toISOString().replace(/T/, " ")}] ${msg}`); }
const fs = require("fs");
const telebot = require("telebot");
const botToken = process.argv[2];
const groupId = Number(process.argv[3]);
const bot = new telebot(botToken);
const userMessage = user => `Здрасти, @${userToString(user)}! Пиши ни нещо, да знаем че не си бот... ;)`;
const replyInterval = 5; // new users must reply in X minutes
let unknown = [];
let humans = [];
let msgBuffer = {};

try {
	fs.readFile("humans.json", (err, data) => {
		if (err) {
			log(err);
			return;
		}
		try {
			humans = JSON.parse(data);
			log(`Loaded ${humans.length} human(s) from storage`);
		} catch(e) {
			log(`Loading storage failed: ${e}`);
			console.log(e);
		}
	});
} catch(e) {
	log(`Reading file failed: ${e}`);
	console.log(e);
}

Array.prototype.remove = function(elem) {
	return this.splice(this.indexOf(elem), 1);
}

const userToString = user => {
	return user.username || `${user.first_name || ""} ${user.last_name || ""}`.trim() || user.id;
};

const syncHumans = id => {
	try {
		fs.writeFile("humans.json", JSON.stringify(humans), (err) => {
			if (err) {
				throw err;
			} else {
				log(`Human users array synced to storage`);
			}
		});
	} catch (e) {
		log(`Failed to sync storage to filesystem`);
		console.log(e);
	}
};

const handleNewChatMember = (msg, bot_id) => {
	//if(msg.chat.type !== "group" || msg.chat.type !== "supergroup") {
	//	return;
	//}

	if(msg.chat.id !== groupId) {
		return;
	}

	if(msg.new_chat_member.id === bot_id.id) {
		log(`The bot has joined a channel`);
		return;
	}

	msg.new_chat_members.forEach((member) => {
		if(!humans.includes(member.id)) {
			unknown.push(member.id);
			log(`${userToString(member)} has joined the channel and is added to unknown users array`);

			bot.sendMessage(msg.chat.id, userMessage(member))
				.then(m => addUserMessage(member.id, m.message_id))
				.catch(err => console.warn('sendMessage error: ', err));

			setTimeout((memberId, chatId) => {
				if(unknown.includes(memberId)) {
					log(`${userToString(member)} did not reply on time, kicking...`);
					deleteUserMessages(chatId, memberId);
					bot.kickChatMember(chatId, memberId).catch(err => console.warn('kickChatMember error: ', err));
					unknown.remove(memberId);
				}
			}, replyInterval * 1000 * 60, member.id, msg.chat.id);

			log(`${userToString(member)} has been messaged, waiting for a reply...`);
		} else {
			log(`${userToString(member)} has joined the channel and is a known human`);
		}
	});
};

const addUserMessage = (userId, messageId) => {
	if(msgBuffer.hasOwnProperty(userId)) {
		msgBuffer[userId].push(messageId);
	} else {
		msgBuffer[userId] = [messageId];
	}
};

const deleteUserMessages = (chatId, userId) => {
	msgBuffer[userId].forEach(messageId => {
		bot.deleteMessage(chatId, messageId).catch(err => console.warn('deleteMessage error: ', err));
	});

	delete msgBuffer[userId];
};

const handleMessage = msg => {
	//if(msg.chat.type === "group" || msg.chat.type === "supergroup") {
	if(msg.chat.id === groupId) {
		log(`${userToString(msg.from)}: ${msg.text}`);

		if(unknown.includes(msg.from.id)) {
			addUserMessage(msg.from.id, msg.message_id);
			unknown.remove(msg.from.id);
			humans.push(msg.from.id);
			log(`${userToString(msg.from)} has responded to message and is moved to human users array`);

			syncHumans(msg.from.id);
			deleteUserMessages(msg.chat.id, msg.from.id);
		}
	} else {
		log(`Message outside scope >> (id: ${msg.chat.id}, username: ${msg.chat.username}, type: ${msg.chat.type}) >> ${userToString(msg.from)}: ${msg.text}`);
	}
};

bot.getMe().then(bot_id => {
	bot.on("newChatMembers", msg => {
		handleNewChatMember(msg, bot_id);
	});
	bot.on("text", msg => {
		handleMessage(msg);
	});
});

bot.start();
