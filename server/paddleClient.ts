import { Environment, Paddle } from "@paddle/paddle-node-sdk";
import { ENV } from "./_core/env";

let _paddle: Paddle | null = null;

export function getPaddleClient(): Paddle {
  if (!ENV.paddleApiKey) throw new Error("Paddle is not configured (PADDLE_API_KEY missing).");
  if (!_paddle) {
    _paddle = new Paddle(ENV.paddleApiKey, {
      environment: ENV.paddleEnvironment === "production" ? Environment.production : Environment.sandbox,
    });
  }
  return _paddle;
}
