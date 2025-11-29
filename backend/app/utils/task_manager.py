"""
任务管理器 - 管理转换任务的内存存储
"""
from typing import Dict, Optional
from datetime import datetime

from app.models import ConvertTask, TaskState


class TaskManager:
    """任务管理器"""
    
    def __init__(self):
        self._tasks: Dict[str, ConvertTask] = {}
    
    def create_task(self, task: ConvertTask) -> None:
        """创建任务"""
        self._tasks[task.id] = task
    
    def get_task(self, task_id: str) -> Optional[ConvertTask]:
        """获取任务"""
        return self._tasks.get(task_id)
    
    def update_task(self, task: ConvertTask) -> None:
        """更新任务"""
        task.updated_at = datetime.now()
        self._tasks[task.id] = task
    
    def delete_task(self, task_id: str) -> None:
        """删除任务"""
        if task_id in self._tasks:
            del self._tasks[task_id]
    
    def get_all_tasks(self) -> Dict[str, ConvertTask]:
        """获取所有任务"""
        return self._tasks.copy()
    
    def get_expired_tasks(self, expire_time: int) -> list[ConvertTask]:
        """获取过期任务"""
        now = datetime.now()
        expired = []
        for task in self._tasks.values():
            if (now - task.created_at).total_seconds() > expire_time:
                expired.append(task)
        return expired
    
    def get_stats(self) -> dict:
        """获取任务统计"""
        tasks = list(self._tasks.values())
        return {
            "total": len(tasks),
            "queued": sum(1 for t in tasks if t.state == TaskState.QUEUED),
            "processing": sum(1 for t in tasks if t.state == TaskState.PROCESSING),
            "finished": sum(1 for t in tasks if t.state == TaskState.FINISHED),
            "error": sum(1 for t in tasks if t.state == TaskState.ERROR)
        }


# 全局任务管理器实例
task_manager = TaskManager()
