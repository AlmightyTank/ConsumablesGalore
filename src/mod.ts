import { DependencyContainer } from "tsyringe";
import { Ilogger } from "@spt/models/spt/utils/Ilogger";
import { IPostDBLoadMod } from "@spt/models/external/IPostDBLoadMod";
import { DatabaseServer } from "@spt/servers/DatabaseServer";
import { ILocationData } from "@spt/models/spt/server/ILocations";
import { MongoID } from "@spt/models/enums/MongoID";

//item creation
import { CustomItemService } from "@spt/services/mod/CustomItemService";
import { NewItemFromCloneDetails } from "@spt/models/spt/mod/NewItemDetails";

import * as https from "https";

import * as path from "path";
const fs = require('fs');
const modPath = path.normalize(path.join(__dirname, '..'));


class ConsumablesGalore implements IPostDBLoadMod
{
	private logger: Ilogger;
	public mod: string;
	public modShortName: string;

	constructor() {
		this.mod = "MusicManiac-Consumables-Galore";
		this.modShortName = "Consumables Galore";
	}

	public postDBLoad ( container: DependencyContainer ): void 
	{
		// Get the logger from the server container.
		this.logger = container.resolve<Ilogger>("WinstonLogger");
		const logger = this.logger;
		logger.info(`[${this.modShortName}] ${this.mod} started loading`);
		// Get database from server.
		const db = container.resolve<DatabaseServer>( "DatabaseServer" );

		//Custom item server to create new items.
		const customItem = container.resolve<CustomItemService>( "CustomItemService" );

		const config = JSON.parse(fs.readFileSync(path.join(modPath, "config/config.json"), "utf-8"));
		const debugMode = config.debug;
		const realDebugMode = config.realdebug;


		function compareVersions(a: string, b: string): number {
			const parse = (v: string) => v.split(".").map(num => parseInt(num));
			const [a1, a2, a3] = parse(a);
			const [b1, b2, b3] = parse(b);

			if (a1 !== b1) return a1 - b1;
			if (a2 !== b2) return a2 - b2;
			return a3 - b3;
		}

		// Check GitHub for latest release
		function checkForUpdates(localVersion: string, logger: Ilogger): void {
			const options = {
				hostname: 'api.github.com',
				path: '/repos/AlmightyTank/ConsumablesGalore/releases/latest',
				method: 'GET',
				headers: {
					'User-Agent': 'SPT-AKI-Mod',
					'Accept': 'application/vnd.github.v3+json'
				}
			};

			const req = https.request(options, (res) => {
				let data = '';

				res.on('data', (chunk) => {
					data += chunk;
				});

			res.on('end', () => {
				try {
					const release = JSON.parse(data);
					// Get only version after last dash (e.g., v3.11-1.4.2 → 1.4.2)
					const tag = release.tag_name;
					const latestVersion = tag.includes("-") ? tag.split("-").pop() : tag.replace(/^v/, "");

					const comparison = compareVersions(localVersion, latestVersion);

					if (comparison < 0) {
						logger.warning(`[Consumables Galore] New version available: v${latestVersion}. You're using v${localVersion}. Visit: ${release.html_url}`);
					} else if (comparison > 0) {
						logger.info(`[Consumables Galore] You are using a newer version (v${localVersion}) than the latest release (v${latestVersion}). Updating the mod?`);
					} else {
						logger.info(`[Consumables Galore] You're using the latest version (v${localVersion})`);
					}
				} catch (err) {
					logger.error(`[Consumables Galore] Could not parse GitHub release info: ${err}`);
				}
			});

			});

			req.on('error', (err) => {
				logger.error(`[Consumables Galore] Failed to check for updates: ${err}`);
			});

			req.end();
		}

		const packageData = JSON.parse(fs.readFileSync(`${modPath}/package.json`, 'utf-8'));
		checkForUpdates(packageData.version, logger);


		// Get tables from database
		let tables = db.getTables();
		// Get item database from tables
		const itemDB = tables.templates.items;
		const handbook = tables.templates.handbook;
		const fleaPriceTable = tables.templates.prices;
		const quests = tables.templates.quests;
		const traders = tables.traders;
		const production = tables.hideout.production.recipes;
		const modShortName = this.modShortName;

		function traverse(dir: string): void {
			const files = fs.readdirSync(dir);
			files.forEach((file) => {
				const filePath = path.join(dir, file);
				const stat = fs.statSync(filePath);
				if (stat.isDirectory()) {
					traverse(filePath);
				} else if (path.extname(filePath).toLowerCase() === '.json') {
					if (debugMode) console.log(`[${modShortName}] Processing file:`, filePath);
					const fileContent = fs.readFileSync(filePath, 'utf-8');
					try {
						const consumableFile = JSON.parse(fileContent);
						const originalConsumable = consumableFile.cloneOrigin;
						const handbookEntry = handbook.Items.find(item => item.Id === originalConsumable);
						const handbookParentId = handbookEntry ? handbookEntry.ParentId : undefined;
						const newConsumableId = consumableFile.id;

						let fleaPrice: number;
						if (consumableFile.fleaPrice === "asOriginal") {
							fleaPrice = fleaPriceTable[originalConsumable];
						} else if (consumableFile.fleaPrice <= 10) {
							fleaPrice = fleaPriceTable[originalConsumable] * consumableFile.fleaPrice;
						} else {
							fleaPrice = consumableFile.fleaPrice;
						}

						let handbookPrice: number;
						if (consumableFile.handBookPrice === "asOriginal") {
							handbookPrice = handbook.Items.find(item => item.Id === originalConsumable)?.Price;
						} else if (consumableFile.handBookPrice <= 10) {
							handbookPrice = fleaPriceTable[originalConsumable] * consumableFile.handBookPrice;
						} else {
							handbookPrice = consumableFile.handBookPrice;
						}

						const consumableClone: NewItemFromCloneDetails = {
							itemTplToClone: originalConsumable,
							 overrideProperties: {
                                BackgroundColor: consumableFile.BackgroundColor ? consumableFile.BackgroundColor : itemDB[originalConsumable]._props.BackgroundColor,
                                StimulatorBuffs: newConsumableId,
                                effects_health: consumableFile.effects_health ? consumableFile.effects_health : itemDB[originalConsumable]._props.effects_health,
                                effects_damage: consumableFile.effects_damage ? consumableFile.effects_damage : itemDB[originalConsumable]._props.effects_damage,
                                MaxHpResource: consumableFile.MaxResource ? consumableFile.MaxResource : itemDB[originalConsumable]._props.MaxHpResource,
                                medUseTime: consumableFile.medUseTime ? consumableFile.medUseTime : itemDB[originalConsumable]._props.medUseTime,
                                Prefab: consumableFile.Prefab ? consumableFile.Prefab : itemDB[originalConsumable]._props.Prefab,
                                UsePrefab: consumableFile.UsePrefab ? consumableFile.UsePrefab : itemDB[originalConsumable]._props.UsePrefab,
                                ItemSound: consumableFile.ItemSound ? consumableFile.ItemSound : itemDB[originalConsumable]._props.ItemSound
                            },
							newId: newConsumableId,
							parentId: itemDB[originalConsumable]._parent,
							handbookParentId: handbookParentId,
							fleaPriceRoubles: fleaPrice,
							handbookPriceRoubles: handbookPrice,
							locales: consumableFile.locales
						}
						customItem.createItemFromClone(consumableClone);

						if (consumableFile.hasOwnProperty("Buffs")) {
							tables.globals.config.Health.Effects.Stimulator.Buffs[newConsumableId] = consumableFile.Buffs;
						}
						
						// Add to quests
						if (consumableFile.includeInSameQuestsAsOrigin) {
							for (const quest of Object.keys(quests)) {
								const questContent = quests[quest];
								for (const nextCondition of questContent.conditions.AvailableForFinish) {
									let nextConditionData = nextCondition;
									if ((nextConditionData.conditionType == "HandoverItem" || nextConditionData.conditionType == "FindItem") && nextConditionData.target.includes(originalConsumable)) {
										if (debugMode) logger.info(`[${modShortName}] found ${originalConsumable} as find/handover item in quest ${questContent._id} aka ${questContent.QuestName}, adding ${newConsumableId} to it`);
										nextConditionData.target.push(newConsumableId);
									}
								}
							}
						}
						
						// Add spawn points
						if (consumableFile.addSpawnsInSamePlacesAsOrigin) {
							// Big thanks to RainbowPC and his Lots Of Loot (https://hub.sp-tarkov.com/files/file/697-lots-of-loot/) as this function to inject loot into map loot spawns is direct steal from there 
							const lootComposedKey = newConsumableId +"_composedkey"
							const maps = ["bigmap", "woods", "factory4_day", "factory4_night", "interchange", "laboratory", "lighthouse", "rezervbase", "shoreline", "tarkovstreets", "sandbox"];
							for (const [name, temp] of Object.entries(tables.locations)) {
								const mapdata : ILocationData = temp;
								for (const Map of maps) {
									if (name === Map) {
										for (const point of mapdata.looseLoot.spawnpoints) {
											for (const itm of point.template.Items) {
												if (itm._tpl == originalConsumable) {
													const originalItemID = itm._id;
													let originRelativeProb: any;
													for (const dist of point.itemDistribution) {
														if (dist.composedKey.key == originalItemID) {
															originRelativeProb = dist.relativeProbability;
															point.template.Items.push({
																_id: lootComposedKey,
																_tpl: newConsumableId
															})
														}
													}
													point.itemDistribution.push({
														composedKey: {
															key: lootComposedKey
														},
														relativeProbability: Math.max(Math.round(originRelativeProb * consumableFile.spawnWeightComparedToOrigin), 1)
													})
												}
											}
										}
										const staticLoot = mapdata.staticLoot;
										for (const container in staticLoot) {
											const originIndex = staticLoot[container].itemDistribution.findIndex(entry => entry.tpl === originalConsumable);
											if (originIndex !== -1) {
												const originProbability = staticLoot[container].itemDistribution[originIndex].relativeProbability
												const spawnRelativeProbability = Math.max(Math.round(originProbability * consumableFile.spawnWeightComparedToOrigin), 1);
												if (realDebugMode) logger.warning(`[${modShortName}] didn't find existing entry for ${newConsumableId} in container ${container} items distribution`);
												staticLoot[container].itemDistribution.push({
													tpl: newConsumableId,
													relativeProbability: spawnRelativeProbability
												})
												const lastElement = staticLoot[container].itemDistribution[staticLoot[container].itemDistribution.length - 1];
												if (realDebugMode) logger.warning(`[${modShortName}] pushed element: ${JSON.stringify(lastElement)}`);
											}
										}
									}
								}
							}
						}

						// add to traders
						if (consumableFile.hasOwnProperty("trader")) {
							const trader = traders[consumableFile.trader.traderId];
							trader.assort.items.push({
								"_id": newConsumableId,
								"_tpl": newConsumableId,
								"parentId": "hideout",
								"slotId": "hideout",
								"upd":
								{
									"UnlimitedCount": false,
									"StackObjectsCount": consumableFile.trader.amountForSale
								}
							});
							trader.assort.barter_scheme[newConsumableId] = [
								[
									{
										"count": consumableFile.trader.price,
										"_tpl": "5449016a4bdc2d6f028b456f" // roubles
									}
								]
							];
							trader.assort.loyal_level_items[newConsumableId] = consumableFile.trader.loyaltyReq;
						}

						// add craft
						if (consumableFile.hasOwnProperty("craft")) {
							production.push(consumableFile.craft);
						}
					} catch (error) {
						logger.error(`Failed to parse JSON: ${error}\nSelected item will not be loaded`, error);
					}
				}
			});
		}
		traverse(`${modPath}/items/`);
		logger.success(`[${this.modShortName}] ${this.mod} finished loading`);
	}
}

module.exports = { mod: new ConsumablesGalore() }
