import 'dotenv/config'
import { Connection, Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js"
import NodeWallet from '@coral-xyz/anchor/dist/cjs/nodewallet'
import { AnchorProvider } from '@coral-xyz/anchor'
import bs58 from 'bs58'
import { PumpFunSDK } from 'pumpdotfun-sdk'
import OpenAI from 'openai'

const { RPC, DEPLOYER_KEYPAIR, OPEN_AI_KEY } = process.env
const BUY_AMOUNT = 3
const GITHUB_URL = 'https://github.com/pump-deployer/ai-pump-deployer';

const openai = new OpenAI({
    apiKey: OPEN_AI_KEY,
})

const pumpKeypairGen = () => {
    let keypair = new Keypair()
    return keypair
}

const getTokenMetadataByAI = async () => {
    console.log('Sending metadata request to OpenAI...')
    const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        max_tokens: 100,
        messages: [{
            role: 'system',
            content: `Using the provided schema, create metadata for a cute dog-themed token. I want this token to have an adorable and playful vibe, while still implying that it’s a fun and quirky way to generate value. Avoid directly copying existing projects like Dogecoin or Shiba Inu. The token name should convey a sense of joy and charm, as if it's backed by a cute dog's endless energy.

            Make sure the description is fun, slightly silly, and no more than 15 words. At the end of the description, include 'Token fully created and deployed by AI.' The name should sound lovable and fit within the following schema: 
            
            {
                name: string,
                symbol: string,
                description: string,
            }
            
            Where name can contain a maximum of 32 characters, symbol can contain a maximum of 6 characters, and description can contain a maximum of 100 characters. Symbol should be an abbreviation of name.
            Return only json object.
            `
        }],
    })

    console.log('Done')
    const responseMessage = response.choices[0].message.content
    const mainMessage = JSON.parse(responseMessage || '{}')

    console.dir(mainMessage)

    const prompt = `Create an icon represnting things based on token data (name, symbol and description), but without attaching any text to generated image. Make it look like drawn by kid.
                Name: ${mainMessage.name}
                Symbol: ${mainMessage.symbol}
                Description: ${mainMessage.description}
        `

    console.log('Sending icon request to OpenAI...')
    const tokenIcon = await openai.images.generate({
        prompt,
        n: 1,
        size: '256x256',
        quality: 'standard',
        model: 'dall-e-2',
    })
    console.log('Done')

    const iconImageUrl = tokenIcon.data[0].url

    if (!iconImageUrl) {
        throw new Error('Icon image url not found')
    }

    console.log(`Icon image url: ${iconImageUrl}`)

    const fetchedImage = await fetch(iconImageUrl).then((res) => res.blob())

    return {
        ...mainMessage,
        file: fetchedImage,
        twitter: GITHUB_URL,
        telegram: GITHUB_URL,
        website: GITHUB_URL,
    } as {
        name: string,
        symbol: string,
        description: string,
        file: Blob
        twiiter: string,
        telegram: string,
        website: string,
    }
}

const main = async () => {
    console.log('Initializing script...')
    const connection = new Connection(RPC || "")
    const wallet = Keypair.fromSecretKey(bs58.decode(DEPLOYER_KEYPAIR || ""))
    const anchorWallet = new NodeWallet(Keypair.fromSecretKey(bs58.decode(DEPLOYER_KEYPAIR || "")))
    const provider = new AnchorProvider(connection, anchorWallet, { commitment: "finalized" })

    const sdk = new PumpFunSDK(provider)

    console.log('Generating metadata...')

    const tokenMetadata = await getTokenMetadataByAI()

    console.log(`Token metadata ready:`)
    console.dir(tokenMetadata)

    const mint = pumpKeypairGen()
    console.log(`Token mint: ${mint.publicKey}`)

    console.log('Deploying token...')
    const createResults = await sdk.createAndBuy(
        wallet,
        mint,
        tokenMetadata,
        BigInt(BUY_AMOUNT * LAMPORTS_PER_SOL),
        BigInt(100),
        {
            unitLimit: 250000,
            unitPrice: 1000000,
        }
    )

    if (createResults.success) {
        console.log('Finished')
        console.log(`https://pump.fun/${mint.publicKey.toBase58()}`)
    }
}

main()
