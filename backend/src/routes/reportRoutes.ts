import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import {
  exportReportToCsv,
  exportReportToExcel,
  exportReportToPdf,
  generateReportData,
  getDashboardOverview,
} from '../services/reportService.js';
import { asyncHandler } from '../utils/errors.js';

export const reportRouter = Router();

reportRouter.use(requireAuth);

reportRouter.get(
  '/dashboard',
  asyncHandler(async (_req, res) => {
    const overview = await getDashboardOverview();
    res.json(overview);
  }),
);

reportRouter.get(
  '/:reportType',
  asyncHandler(async (req, res) => {
    const from = req.query.from ? new Date(String(req.query.from)) : undefined;
    const to = req.query.to ? new Date(String(req.query.to)) : undefined;
    if (to) to.setHours(23, 59, 59, 999);

    const reportType = String(req.params.reportType);
    const report = await generateReportData(reportType, { from, to });
    const format = String(req.query.format || 'json').toLowerCase();

    if (format === 'xlsx' || format === 'excel') {
      const buffer = await exportReportToExcel(report.title, report.columns, report.rows);
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="savorsouth-${reportType}.xlsx"`,
      );
      res.send(buffer);
      return;
    }

    if (format === 'csv') {
      const csv = exportReportToCsv(report.columns, report.rows);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="savorsouth-${reportType}.csv"`,
      );
      res.send(csv);
      return;
    }

    if (format === 'pdf') {
      const buffer = exportReportToPdf(report.title, report.columns, report.rows);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="savorsouth-${reportType}.pdf"`,
      );
      res.send(buffer);
      return;
    }

    res.json(report);
  }),
);
