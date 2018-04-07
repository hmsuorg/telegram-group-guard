const log = (msg) => { console.log(`[${new Date().toISOString().replace(/T/, " ").replace(/\..+/, "")}] ${msg}`); }
const TeleBot = require("telebot");
const bot = new TeleBot(process.argv[2]);
bot.getMe().then(bot_id => {
	const timeLimit = 1000 * 90;
	const askInterval = 1000 * 30;
	let unauthorized = [];
	bot.on("newChatMembers", msg => {
		if(msg.new_chat_member.id === bot_id.id) return;
		if(!Number.isInteger(unauthorized[msg.new_chat_member.username])) {
			log(`${msg.new_chat_member.username} has joined the channel`);
			unauthorized[msg.new_chat_member.username] = 1;
		} else {
			//kick?
		}
		let interval = setInterval(() => {
			if(!Number.isInteger(unauthorized[msg.new_chat_member.username])) {
				clearInterval(interval);
				log(`Clearing interval...`);
			} else {
				if(unauthorized[msg.new_chat_member.username] * askInterval > timeLimit) {
					clearInterval(interval);
					log(`${msg.new_chat_member.username} didn't answer on time, kicking...`);
					msg.reply.text(`@${msg.new_chat_member.username}, gotta kick you...`);
					bot.kickChatMember(msg.chat.id, msg.new_chat_member.id);
				} else {
					log(`Asking ${msg.new_chat_member.username} for the ${unauthorized[msg.new_chat_member.username]} time...`);
					msg.reply.text(`@${msg.new_chat_member.username}, are you a bot?`);
					unauthorized[msg.new_chat_member.username] += 1;
				}
			}
		}, askInterval);
	});
	bot.on("text", msg => {
		log(`${msg.from.username}: ${msg.text}`);
		if(Number.isInteger(unauthorized[msg.from.username])) {
			//if(msg.text == "no") {
				msg.reply.text(`great!`, {asReply: true});
				delete unauthorized[msg.from.username];
			//} else {
			//	msg.reply.text(`you can say 'no' if you aren't`, {asReply: true});
			//}
		} else {
			//authorised user-command space
			//if(msg.text == "!radio") {
			//	msg.reply.text(`Radio is (online|offline) on https://radio.hmsu.org/`);
			//}
		}
	});
});
bot.start();
