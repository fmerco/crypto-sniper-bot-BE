const app = require("express")();
const http = require("http").Server(app);
const io = require("socket.io")(http, {
  cors: {
    origin: "*",
  },
});

const bodyParser = require("body-parser");
const cors = require("cors");

const ethers = require("ethers");

const pino = require("pino");
const expressPino = require("express-pino-logger");
const logger = pino({ level: process.env.LOG_LEVEL || "info" });
const expressLogger = expressPino({ logger });

const port = 3000;

app.use(cors());
app.use(expressLogger);
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

const ActiveFactoryMap = new Map();

/* SOCKET.IO CONNECTION */
io.on("connection", (socket) => {
  socket.emit("socketId", socket.id);
  console.log("connected", socket.id);

  socket.on("disconnect", (data) => {
    console.log("disconnected", socket.id);
    ActiveFactoryMap.get(socket.id)?.removeAllListeners();
  });
});

/* COSTANTS */
const CONSTANTS = {
  FACTORY_ADDRESS: "0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73", // PancakeSwap V2 factory address
  ROUTER_ADDRESS: "0x10ED43C718714eb63d5aA57B78B54704E256024E", //PancakeSwap V2 router
  BNB_ADDRESS: "0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c", // BNB CONTRACT ADDRESS
  BUSD_ADDRESS: "0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c", // BUSD CONTRACT ADDRESS

  FACTORY_ABI: [
    "event PairCreated(address indexed token0, address indexed token1, address pair, uint)",
    "function getPair(address tokenA, address tokenB) external view returns (address pair)",
  ],
  ROUTER_ABI: [
    "function getAmountsOut(uint amountIn, address[] memory path) public view returns (uint[] memory amounts)",
    "function swapExactTokensForTokens(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)",
    "function swapExactTokensForTokensSupportingFeeOnTransferTokens(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)",
    "function swapETHForExactTokens(uint amountOut, address[] calldata path, address to, uint deadline) external  payable returns (uint[] memory amounts)",
    "function swapExactETHForTokens( uint amountOutMin, address[] calldata path, address to, uint deadline) external payable returns (uint[] memory amounts)",
  ],
};

/* ENDPOINTS */
app.post("/pair-created-listner", (req, res) => {
  const body = req.body;

  io.to(body.socketId).emit("logs", "BOT STARTED");

  logger.info("PRIVATE KEY: " + body.privateKey);
  logger.info("AMOUNT TO BUY: " + body.amountToBuy);
  logger.info("AMOUNT OUT MIN: " + body.amountOutMin);
  logger.info("RECIPIENT: " + body.recipient);
  logger.info("GAS LIMIT: " + body.gasLimit);
  logger.info("GAS PRICE: " + body.gasPrice);
  logger.info("Token To Buy: " + body.tokenToBuy);
  logger.info("DECIMALS: " + body.decimals);
  logger.info("RPC: " + body.rpc);

  const provider =
    body.rpc.indexOf("wss") >= 0
      ? new ethers.providers.WebSocketProvider(body.rpc)
      : new ethers.providers.JsonRpcProvider(body.rpc);
  const wallet = new ethers.Wallet(body.privateKey);
  const account = wallet.connect(provider);

  const factory = new ethers.Contract(
    CONSTANTS.FACTORY_ADDRESS,
    CONSTANTS.FACTORY_ABI,
    account
  );

  const router = new ethers.Contract(
    CONSTANTS.ROUTER_ADDRESS,
    CONSTANTS.ROUTER_ABI,
    account
  );

  ActiveFactoryMap.set(body.socketId, factory);

  factory.on("PairCreated", async (token0, token1, pairAddress) => {
    [token0, token1, pairAddress, body.tokenToBuy] = [
      token0.toUpperCase(),
      token1.toUpperCase(),
      pairAddress.toUpperCase(),
      body.tokenToBuy.toUpperCase(),
    ];

    logger.info("");
    logger.info("::::::::::::::::::::::::::::::::::::::::::::::::");
    logger.info("DATE: " + new Date());
    logger.info("TOKEN0: " + (token0 || ""));
    logger.info("TOKEN1 : " + (token1 || ""));
    logger.info("PAIR ADDRESS: " + (pairAddress || ""));
    logger.info("::::::::::::::::::::::::::::::::::::::::::::::::");
    logger.info("");

    io.to(body.socketId).emit(
      "logs",
      `
~~~~~~~~~~~~~~~~~~
New pair detected
~~~~~~~~~~~~~~~~~~
token0: ${token0}
token1:  ${token1}
addressPair:  ${pairAddress}
`
    );

    if (token0 === body.tokenToBuy || token1 === body.tokenToBuy) {
      logger.info("");
      logger.info("::::::::::::::::::::::::::::::::::::::::::::::::");
      logger.info("FOUND!");
      logger.info("::::::::::::::::::::::::::::::::::::::::::::::::");
      logger.info("");

      io.to(body.socketId).emit("logs", `<strong>Pair FOUND!</strong>`);

      if (token0 === CONSTANTS.BNB_ADDRESS) {
        swapExactETHForTokens(
          factory,
          router,
          body.amountToBuy,
          body.amountOutMin,
          token0,
          token1,
          body.recipient,
          body.gasLimit,
          body.gasPrice,
          body.decimals
        );
      } else if (token1 === CONSTANTS.BNB_ADDRESS) {
        swapExactETHForTokens(
          factory,
          router,
          body.amountToBuy,
          body.amountOutMin,
          token1,
          token0,
          body.recipient,
          body.gasLimit,
          body.gasPrice,
          body.decimals
        );
      } else if (token0 === CONSTANTS.BUSD_ADDRESS) {
        swapExactTokensForTokens(
          factory,
          router,
          body.amountToBuy,
          body.amountOutMin,
          token0,
          token1,
          body.recipient,
          body.gasLimit,
          body.gasPrice,
          body.decimals
        );
      } else if (token1 === CONSTANTS.BUSD_ADDRESS) {
        swapExactTokensForTokens(
          factory,
          router,
          body.amountToBuy,
          body.amountOutMin,
          token1,
          token0,
          body.recipient,
          body.gasLimit,
          body.gasPrice,
          body.decimals
        );
      }
    } else {
      io.to(body.socketId).emit(
        "logs",
        `<strong>Pair don't match! </strong>
~~~~~~~~~~~~~~~~~`
      );
    }
  });

  res.send({ res: "BOT STARTED" });
});

app.post("/remove-all-listners", (req, res) => {
  const body = req.body;
  io.to(body.socketId).emit("logs", `BOT TERMINATED`);
  ActiveFactoryMap.get(body.socketId)?.removeAllListeners();
  res.send({ res: "DONE" });
});

/*  FUNCTIONS */
async function swapExactETHForTokens(
  factory,
  router,
  amountToBuy,
  amountOutMin,
  tokenIn,
  tokenOut,
  recipient,
  gasLimit,
  gasPrice,
  decimals
) {
  logger.info("        ");
  logger.info(":::::::::::::::::::::::::::::::::::");
  logger.info("swapExactETHForTokens");
  logger.info("amountToBuy: " + amountToBuy);
  logger.info("amountOutMin: " + amountOutMin * 10 ** decimals);
  logger.info("tokenIn, tokenOut: " + tokenIn + " - " + tokenOut);
  logger.info("recipient: " + recipient);
  logger.info("gasLimit: " + gasLimit);
  logger.info("gasPrice: " + gasPrice);
  logger.info("decimals: " + decimals);

  logger.info(":::::::::::::::::::::::::::::::::::");
  logger.info("        ");
  const amountIn = ethers.utils.parseUnits(amountToBuy, "ether");
  io.to(body.socketId).emit("logs", `Token sniping start ... `);

  const tx = await router.swapExactETHForTokens(
    `${amountOutMin * 10 ** decimals}`,
    [tokenIn, tokenOut],
    recipient,
    Date.now() + 1000 * 60 * 5, //5 minutes
    {
      gasLimit: gasLimit,
      gasPrice: ethers.utils.parseUnits(`${gasPrice}`, "gwei"),
      nonce: null,
      value: amountIn,
    }
  );
  tx.wait()
    .then((resp) => {
      logger.info(resp);
      io.to(body.socketId).emit(
        "logs",
        `<strong>Token successfully sniped! ;)</strong>
~~~~~~~~~~~~~~~~~`
      );
      factory.removeAllListeners();
    })
    .catch((err) => {
      logger.info(resp);
      io.to(body.socketId).emit(
        "logs",
        `<strong>ERROR! Unsuccessful sniping :(</strong>
~~~~~~~~~~~~~~~~~`
      );
      factory.removeAllListeners();
    });
}
async function swapExactTokensForTokens(
  factory,
  router,
  amountToBuy,
  amountOutMin,
  tokenIn,
  tokenOut,
  recipient,
  gasLimit,
  gasPrice,
  decimals
) {
  logger.info("        ");
  logger.info(":::::::::::::::::::::::::::::::::::");
  logger.info("swapExactTokensForTokens");
  logger.info("amountToBuy: " + amountToBuy);
  logger.info("amountOutMin: " + amountOutMin * 10 ** decimals);
  logger.info("tokenIn, tokenOut: " + tokenIn + " - " + tokenOut);
  logger.info("recipient: " + recipient);
  logger.info("gasLimit: " + gasLimit);
  logger.info("gasPrice: " + gasPrice);
  logger.info("swapExactTokensForTokens");
  logger.info(":::::::::::::::::::::::::::::::::::");
  logger.info("        ");
  const amountIn = amountToBuy * 600 * 10 ** 18; // calcolare BUSD oppure no?
  const tx = await router.swapExactTokensForTokens(
    `${amountIn}`,
    `${amountOutMin * 10 ** decimals}`,
    [tokenIn, tokenOut],
    recipient,
    Date.now() + 1000 * 60 * 5,
    {
      gasLimit: gasLimit,
      gasPrice: ethers.utils.parseUnits(`${gasPrice}`, "gwei"),
      nonce: null, // TODO settarlo o va bene cosi'?
    }
  );
  tx.wait().then((resp) => {
    logger.info(resp);
    factory.off("PairCreated");
    return;
  });
}

/* START SERVER */
http.listen(port, () => console.log(`SniperBot listening on port ${port}!`));
