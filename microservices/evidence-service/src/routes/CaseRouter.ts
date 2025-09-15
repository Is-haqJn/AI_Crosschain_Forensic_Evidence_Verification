import { Router } from 'express';
import { CaseController } from '../controllers/CaseController.js';
import { AuthMiddleware } from '../middleware/AuthMiddleware.js';
// import { ValidationMiddleware } from '../middleware/ValidationMiddleware.js';

export class CaseRouter {
  private router: Router;
  private controller: CaseController;
  private auth: AuthMiddleware;
  // private validate: ValidationMiddleware; // reserved for future validation

  constructor() {
    this.router = Router();
    this.controller = new CaseController();
    this.auth = new AuthMiddleware();
    // this.validate = new ValidationMiddleware();
    this.init();
  }

  private init(): void {
    // Create case
    this.router.post(
      '/',
      this.auth.authenticate.bind(this.auth),
      this.controller.create.bind(this.controller)
    );

    // List cases
    this.router.get(
      '/',
      this.auth.authenticate.bind(this.auth),
      this.controller.list.bind(this.controller)
    );

    // Get case by id
    this.router.get(
      '/:id',
      this.auth.authenticate.bind(this.auth),
      this.controller.get.bind(this.controller)
    );

    // Add evidence to case
    this.router.post(
      '/:id/evidence',
      this.auth.authenticate.bind(this.auth),
      this.controller.addEvidence.bind(this.controller)
    );
  }

  public getRouter(): Router {
    return this.router;
  }
}

export default CaseRouter;
