/**
 * @author HighArcs
 * @version 1.0.0
 * @description asks the user for a confirmation message before executing the command
 * @license null
 * @example
 */

import { CommandType, Context, EventPlugin, PluginType } from "@sern/handler";
import { Awaitable, Message, MessageReaction, User } from "discord.js";

type Callback<T> = Awaitable<T> | ((context: Context) => Awaitable<T>);
type PostCallback<T> =
	| Awaitable<T>
	| ((context: Context, result: Message) => any);

interface ConfirmationOptions {
	timeout: number;
	message: Callback<string>;
	onTimeout: PostCallback<string>;
	onCancel: PostCallback<string>;
	onConfirm: PostCallback<string>;
	emojis: Emojis;
}

interface Emojis {
	yes: Callback<string>;
	no: Callback<string>;
}

const defaultOptions: ConfirmationOptions = {
	timeout: 30000,
	message: "are you sure you want to proceed?",
	onTimeout: "confirmation timed out",
	onCancel: "confirmation cancelled",
	onConfirm: (_, result) => {
		try {
			result.delete();
		} catch (e) {}
	},
	emojis: {
		no: "❌",
		yes: "✅",
	},
};

export function confirmation(
	raw: Partial<ConfirmationOptions> = {}
): EventPlugin<CommandType.Both> {
	const options: ConfirmationOptions = Object.assign({}, defaultOptions, raw);
	return {
		name: "confirmation",
		type: PluginType.Event,
		async execute([context], controller) {
			if (typeof options.message === "function") {
				options.message = await options.message(context);
			}

			const response = await context.reply(await options.message);
			let { yes, no } = options.emojis;
			if (typeof yes === "function") {
				yes = await yes(context);
			}

			if (typeof no === "function") {
				no = await no(context);
			}

			await response.react(await yes);
			await response.react(await no);

			function filter(reaction: MessageReaction, user: User) {
				return (
					([yes, no].includes(reaction.emoji.name!) ||
						[yes, no].includes(reaction.emoji.identifier)) &&
					user.id === context.user.id
				);
			}

			const recieved = await response.awaitReactions({
				filter,
				max: 1,
				time: options.timeout,
			});
			if (recieved.size === 0) {
				if (typeof options.onTimeout === "function") {
					await options.onTimeout(context, response);
				} else {
					await response.edit(await options.onTimeout);
					await response.reactions.removeAll();
				}

				return controller.stop();
			}

			const reaction = recieved.first();
			if (!reaction) {
				return controller.stop();
			}

			switch (reaction.emoji.name) {
				case await yes:
					if (typeof options.onConfirm === "function") {
						await options.onConfirm(context, response);
					} else {
						await response.edit(await options.onConfirm);
						await response.reactions.removeAll();
					}

					return controller.next();
				case await no:
					if (typeof options.onCancel === "function") {
						await options.onCancel(context, response);
					} else {
						await response.edit(await options.onCancel);
						await response.reactions.removeAll();
					}

					return controller.stop();
			}

			return controller.next();
		},
	};
}
