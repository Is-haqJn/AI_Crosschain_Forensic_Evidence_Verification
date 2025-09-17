import { Router } from 'express';
import { ActivityController } from '../controllers/ActivityController.js';
import AuthMiddleware from '../middleware/AuthMiddleware.js';

export class ActivityRouter {
  private router: Router;
  private controller: ActivityController;

  constructor() {
    this.router = Router();
    this.controller = new ActivityController();
    this.initializeRoutes();
  }

  private initializeRoutes(): void {
    // Authenticated: show activities relevant to the system (no user filtering yet)
    const auth = new AuthMiddleware();
    this.router.get('/', auth.authenticate.bind(auth), this.controller.getRecent);
  }

  public getRouter(): Router {
    return this.router;
  }
}


